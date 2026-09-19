const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const crypto = require("node:crypto");

initializeApp();

const AZURE_SPEECH_KEY = defineSecret("AZURE_SPEECH_KEY");
const FUNCTION_REGION = "us-east1";
const AZURE_REGION = "eastus";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const SPEECH_PROFILES = {
  "km-KH": {
    name: "Khmer",
    voice: "km-KH-SreymomNeural",
    rate: "-20%",
    cacheVersion: "km-kh-sreymom-rate-80-v2",
    pattern: /[\u1780-\u17ff]/u,
  },
  "th-TH": {
    name: "Thai",
    voice: "th-TH-PremwadeeNeural",
    rate: "-15%",
    cacheVersion: "th-th-premwadee-rate-85-v1",
    pattern: /[\u0e00-\u0e7f]/u,
  },
};
const DAILY_LIMIT = 30;
const MAX_CHARACTERS = 300;
const ADMIN_EMAIL = "f216002@gmail.com";
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;

function normalizeText(value) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/gu, " ");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cambodiaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function assertApprovedTeacher(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Please sign in with Google.");
  }
  const email = String(auth.token.email || "").toLowerCase();
  if (auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Your Google email must be verified.");
  }
  if (email === ADMIN_EMAIL) return;

  const approval = await getFirestore().doc(`approvedTeachers/${auth.uid}`).get();
  if (!approval.exists || approval.data()?.active !== true) {
    throw new HttpsError("permission-denied", "Teacher approval is required.");
  }
}

async function audioResult(cacheRef, usageRef, cached) {
  const snapshot = cached || await cacheRef.get();
  if (!snapshot.exists || snapshot.data()?.status !== "ready") return null;
  const objectPath = snapshot.data().objectPath;
  if (!objectPath) return null;
  const [buffer] = await getStorage().bucket().file(objectPath).download();
  const usage = await usageRef.get();
  return {
    audioBase64: buffer.toString("base64"),
    contentType: "audio/mpeg",
    cached: true,
    dailyLimit: DAILY_LIMIT,
    usedToday: Number(usage.data()?.count || 0),
    remainingToday: Math.max(0, DAILY_LIMIT - Number(usage.data()?.count || 0)),
  };
}

exports.synthesizeKhmer = onCall(
  {
    region: FUNCTION_REGION,
    secrets: [AZURE_SPEECH_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 10,
  },
  async (request) => {
    await assertApprovedTeacher(request.auth);

    const locale = String(request.data?.locale || "km-KH");
    const profile = SPEECH_PROFILES[locale];
    if (!profile) throw new HttpsError("invalid-argument", "This cloud voice is not supported.");
    const { name, voice, rate, cacheVersion, pattern } = profile;

    const text = normalizeText(request.data?.text);
    if (!text) throw new HttpsError("invalid-argument", `${name} text is required.`);
    if (Array.from(text).length > MAX_CHARACTERS) {
      throw new HttpsError("invalid-argument", `Text must be ${MAX_CHARACTERS} characters or fewer.`);
    }
    if (!pattern.test(text)) {
      throw new HttpsError("invalid-argument", `The sentence must contain ${name} text.`);
    }

    const uid = request.auth.uid;
    const day = cambodiaDateKey();
    const cacheId = crypto
      .createHash("sha256")
      .update(`${cacheVersion}|${rate}|${locale}|${voice}|${text}`)
      .digest("hex");
    const db = getFirestore();
    const cacheRef = db.doc(`sharedAudioCache/${cacheId}`);
    const usageRef = db.doc(`ttsDailyUsage/${day}_${uid}`);

    const existing = await audioResult(cacheRef, usageRef);
    if (existing) return existing;

    const reservation = await db.runTransaction(async (tx) => {
      const [cacheSnap, usageSnap] = await Promise.all([
        tx.get(cacheRef),
        tx.get(usageRef),
      ]);
      const cache = cacheSnap.data();
      if (cache?.status === "ready") return { kind: "ready" };

      const lockAge = cache?.startedAt?.toMillis
        ? Date.now() - cache.startedAt.toMillis()
        : Number.POSITIVE_INFINITY;
      if (cache?.status === "generating" && lockAge < LOCK_TIMEOUT_MS) {
        return { kind: "waiting" };
      }

      const count = Number(usageSnap.data()?.count || 0);
      if (count >= DAILY_LIMIT) {
        throw new HttpsError(
          "resource-exhausted",
          `Today's ${DAILY_LIMIT}-sentence new-voice limit has been reached. Cached sentences still play without using quota.`,
        );
      }

      tx.set(usageRef, {
        uid,
        date: day,
        count: count + 1,
        limit: DAILY_LIMIT,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(cacheRef, {
        status: "generating",
        text,
        locale,
        voice,
        cacheVersion,
        requestedBy: uid,
        startedAt: Timestamp.now(),
      }, { merge: true });
      return { kind: "generate", usedToday: count + 1 };
    });

    if (reservation.kind === "ready") {
      const ready = await audioResult(cacheRef, usageRef);
      if (ready) return ready;
    }
    if (reservation.kind === "waiting") {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const ready = await audioResult(cacheRef, usageRef);
        if (ready) return ready;
      }
      throw new HttpsError("aborted", "This sentence is being prepared. Please tap play again in a moment.");
    }

    const objectPath = `shared-tts/${locale}/${cacheId}.mp3`;
    try {
      const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
      const response = await fetch(
        `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY.value(),
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
            "User-Agent": "MyChineseSentenceBankV3",
          },
          body: ssml,
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        console.error("Azure Speech error", response.status, detail);
        throw new Error(`Azure Speech returned ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error("Azure Speech returned empty audio.");

      await getStorage().bucket().file(objectPath).save(buffer, {
        resumable: false,
        contentType: "audio/mpeg",
        metadata: {
          cacheControl: "private, max-age=31536000, immutable",
          metadata: { locale, voice, cacheVersion },
        },
      });
      await cacheRef.set({
        status: "ready",
        objectPath,
        byteLength: buffer.length,
        completedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        audioBase64: buffer.toString("base64"),
        contentType: "audio/mpeg",
        cached: false,
        dailyLimit: DAILY_LIMIT,
        usedToday: reservation.usedToday,
        remainingToday: Math.max(0, DAILY_LIMIT - reservation.usedToday),
      };
    } catch (error) {
      console.error(`${name} synthesis failed`, error);
      await db.runTransaction(async (tx) => {
        const [cacheSnap, usageSnap] = await Promise.all([
          tx.get(cacheRef),
          tx.get(usageRef),
        ]);
        if (cacheSnap.data()?.status === "generating" &&
            cacheSnap.data()?.requestedBy === uid) {
          tx.delete(cacheRef);
          tx.set(usageRef, {
            count: Math.max(0, Number(usageSnap.data()?.count || 1) - 1),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      });
      throw new HttpsError("internal", `${name} audio could not be generated. Please try again.`);
    }
  },
);
