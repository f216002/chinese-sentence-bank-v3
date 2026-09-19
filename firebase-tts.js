import { getApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const functions = getFunctions(getApp(), "us-east1");
const synthesizeSourceSpeech = httpsCallable(functions, "synthesizeKhmer", { timeout: 60000 });
let activeAudio = null;

function friendlyError(error) {
  const code = String(error?.code || "");
  if (code.includes("unauthenticated")) return "Please sign in with Google first.";
  if (code.includes("permission-denied")) return "Teacher approval is required for cloud voice.";
  if (code.includes("resource-exhausted")) return "Today's 30 new cloud voices are used. Previously generated sentences can still play.";
  if (code.includes("invalid-argument")) return error?.message || "Please check the Khmer sentence.";
  if (code.includes("aborted")) return "This voice is being prepared. Please tap play again in a moment.";
  return "Khmer cloud voice is temporarily unavailable. Please try again.";
}

window.MCSB_TTS = {
  async playSourceSpeech(text, locale, languageName, button, setStatus) {
    button.disabled = true;
    button.classList.add("speaking");
    setStatus(button, `Preparing ${languageName} cloud voice…`);
    try {
      const response = await synthesizeSourceSpeech({ text, locale });
      const result = response.data;
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.src = "";
      }
      activeAudio = new Audio(`data:${result.contentType};base64,${result.audioBase64}`);
      activeAudio.onended = () => {
        button.classList.remove("speaking");
        button.disabled = false;
        const source = result.cached ? "shared cache" : "new Azure voice";
        setStatus(button, `${languageName} playback finished (${source}). ${result.remainingToday} of ${result.dailyLimit} new voices remain today.`);
      };
      activeAudio.onerror = () => {
        button.classList.remove("speaking");
        button.disabled = false;
        setStatus(button, `${languageName} audio could not be played on this device.`);
      };
      await activeAudio.play();
      const source = result.cached ? "shared cache — no quota used" : "new Azure voice";
      setStatus(button, `Playing ${languageName} (${source}). ${result.remainingToday} of ${result.dailyLimit} new voices remain today.`);
    } catch (error) {
      button.classList.remove("speaking");
      button.disabled = false;
      setStatus(button, friendlyError(error));
      console.error(`${languageName} TTS error`, error);
    }
  },
};
