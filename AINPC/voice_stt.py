# ====================================================================
# GTA San Andreas - AI NPC Voice STT (Push-To-Talk via Groq Whisper)
# ====================================================================

import io
import time
import wave
import threading
import requests
import numpy as np
import sounddevice as sd
from llm_brain import load_env

class VoiceSTT:
    def __init__(self):
        env = load_env()
        self.api_key = env.get("GROQ_API_KEY", "")
        self.model = env.get("GROQ_STT_MODEL", "whisper-large-v3-turbo")
        self.endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"

        self.samplerate = 16000
        self.channels = 1
        self.is_recording = False
        self.recorded_chunks = []
        self.stream = None
        self.lock = threading.Lock()
        self.last_latency = 0.0

    def _audio_callback(self, indata, frames, time_info, status):
        if self.is_recording:
            self.recorded_chunks.append(indata.copy())

    def start_recording(self):
        with self.lock:
            if self.is_recording:
                return
            self.recorded_chunks = []
            self.is_recording = True
            try:
                self.stream = sd.InputStream(
                    samplerate=self.samplerate,
                    channels=self.channels,
                    dtype="int16",
                    callback=self._audio_callback
                )
                self.stream.start()
            except Exception as e:
                self.is_recording = False
                print(f"[STT Error starting stream]: {e}", flush=True)

    def stop_recording_and_transcribe(self) -> tuple[str, float]:
        with self.lock:
            if not self.is_recording:
                return ("", 0.0)
            self.is_recording = False

            try:
                if self.stream:
                    self.stream.stop()
                    self.stream.close()
                    self.stream = None
            except Exception:
                pass

            chunks = list(self.recorded_chunks)
            self.recorded_chunks = []

        if not chunks:
            return ("", 0.0)

        audio_data = np.concatenate(chunks, axis=0)
        duration_sec = len(audio_data) / self.samplerate

        # تجاهل الضغطات اللحظية التي تقل عن 0.4 ثانية لتجنب الضوضاء
        if duration_sec < 0.4:
            return ("", 0.0)

        # تحويل المقاطع إلى ملف WAV في الذاكرة Ram فقط
        wav_buf = io.BytesIO()
        with wave.open(wav_buf, "wb") as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(2) # 16-bit
            wf.setframerate(self.samplerate)
            wf.writeframes(audio_data.tobytes())

        wav_bytes = wav_buf.getvalue()

        # إرسال التسجيل الصوتي إلى سحابة Groq Whisper
        start_t = time.time()
        try:
            files = {"file": ("voice_speech.wav", wav_bytes, "audio/wav")}
            data = {"model": self.model}
            headers = {"Authorization": f"Bearer {self.api_key}"}

            resp = requests.post(self.endpoint, headers=headers, files=files, data=data, timeout=8.0)
            self.last_latency = (time.time() - start_t) * 1000

            if resp.status_code == 200:
                result = resp.json()
                text = result.get("text", "").strip()
                return (text, self.last_latency)
            else:
                print(f"[STT Groq Error {resp.status_code}]: {resp.text}", flush=True)
                return ("", self.last_latency)
        except Exception as e:
            print(f"[STT Network Error]: {e}", flush=True)
            return ("", 0.0)

if __name__ == "__main__":
    stt = VoiceSTT()
    print("Testing VoiceSTT: Speak into your microphone for 3 seconds...")
    stt.start_recording()
    time.sleep(3.0)
    print("Recording finished. Transcribing via Groq Whisper...")
    text, latency = stt.stop_recording_and_transcribe()
    print(f"Transcribed Text ({latency:.1f}ms): \"{text}\"")
