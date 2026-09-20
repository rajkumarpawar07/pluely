import {
  deepVariableReplacer,
  getByPath,
  blobToBase64,
} from "./common.function";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

import { TYPE_PROVIDER } from "@/types";
import curl2Json from "@bany/curl-to-json";
import { shouldUsePluelyAPI } from "./pluely.api";

// Pluely STT function
async function fetchPluelySTT(audio: File | Blob): Promise<string> {
  try {
    // Convert audio to base64
    const audioBase64 = await blobToBase64(audio);

    // Call Tauri command
    const response = await invoke<{
      success: boolean;
      transcription?: string;
      error?: string;
    }>("transcribe_audio", {
      audioBase64,
    });

    if (response.success && response.transcription) {
      return response.transcription;
    } else {
      return response.error || "Transcription failed";
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Pluely STT Error: ${errorMessage}`;
  }
}

export interface STTParams {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  audio: File | Blob;
}

/**
 * Transcribes audio and returns either the transcription or an error/warning message as a single string.
 */
export async function fetchSTT(params: STTParams): Promise<string> {
  let warnings: string[] = [];

  try {
    const { provider, selectedProvider, audio } = params;

    // Check if we should use Pluely API instead
    const usePluelyAPI = await shouldUsePluelyAPI();
    if (usePluelyAPI) {
      return await fetchPluelySTT(audio);
    }

    if (!provider) throw new Error("Provider not provided");
    if (!selectedProvider) throw new Error("Selected provider not provided");
    if (!audio) throw new Error("Audio file is required");

    let curlJson: any;
    try {
      curlJson = curl2Json(provider.curl);
    } catch (error) {
      throw new Error(
        `Failed to parse curl: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Validate audio file
    const file = audio as File;
    if (file.size === 0) throw new Error("Audio file is empty");
    // maximum size of 10MB
    // const maxSize = 10 * 1024 * 1024;
    // if (file.size > maxSize) {
    //   warnings.push("Audio exceeds 10MB limit");
    // }

    // Build variable map
    const allVariables = {
      ...Object.fromEntries(
        Object.entries(selectedProvider.variables).map(([key, value]) => [
          key.toUpperCase(),
          typeof value === "string" ? value.trim() : value,
        ])
      ),
    };

    // Prepare request
    let url = deepVariableReplacer(curlJson.url || "", allVariables);
    const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
    const formData = deepVariableReplacer(curlJson.form || {}, allVariables);

    // To Check if API accepts Binary Data
    const isBinaryUpload = provider.curl.includes("--data-binary");
    // Fetch URL Params
    const rawParams = curlJson.params || {};
    // Decode Them
    const decodedParams = Object.fromEntries(
      Object.entries(rawParams).map(([key, value]) => [
        key,
        typeof value === "string" ? decodeURIComponent(value) : "",
      ])
    );
    // Get the Parameters from allVariables
    const replacedParams = deepVariableReplacer(decodedParams, allVariables);

    // Add query parameters to URL
    const queryString = new URLSearchParams(replacedParams).toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }

    let finalHeaders = { ...headers };

    // Google Speech-to-Text expects API key in query param ?key=API_KEY when using API key auth.
    // If Authorization Bearer is sent with an API key, Google returns HTTP 401: Expected OAuth 2 access token.
    if (url.includes("speech.googleapis.com")) {
      const authHeaderKey = Object.keys(finalHeaders).find(
        (k) => k.toLowerCase() === "authorization"
      );
      if (authHeaderKey) {
        const authValue = finalHeaders[authHeaderKey];
        if (authValue && authValue.toLowerCase().startsWith("bearer ")) {
          const token = authValue.substring(7).trim();
          // OAuth2 access tokens for GCP start with 'ya29.'
          // API keys (AIza...) or raw keys should be passed as ?key= parameter
          if (!token.startsWith("ya29.")) {
            delete finalHeaders[authHeaderKey];
            if (!url.includes("key=")) {
              url += (url.includes("?") ? "&" : "?") + `key=${encodeURIComponent(token)}`;
            }
          }
        }
      }
    }
    let body: FormData | string | Blob;

    const isForm =
      provider.curl.includes("-F ") || provider.curl.includes("--form");
    if (isForm) {
      // Helper to reliably parse form entries whether curl2Json produces a string, array, or object
      const parseFormEntries = (form: any): { key: string; value: string }[] => {
        if (!form) return [];
        if (typeof form === "string") {
          const trimmed = form.trim();
          if (!trimmed) return [];
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) return [{ key: trimmed, value: "" }];
          return [
            {
              key: trimmed.slice(0, eqIdx).trim(),
              value: trimmed.slice(eqIdx + 1).trim(),
            },
          ];
        }
        if (Array.isArray(form)) {
          const entries: { key: string; value: string }[] = [];
          for (const item of form) {
            if (typeof item === "string") {
              const trimmed = item.trim();
              if (!trimmed) continue;
              const eqIdx = trimmed.indexOf("=");
              if (eqIdx === -1) {
                entries.push({ key: trimmed, value: "" });
              } else {
                entries.push({
                  key: trimmed.slice(0, eqIdx).trim(),
                  value: trimmed.slice(eqIdx + 1).trim(),
                });
              }
            } else if (item && typeof item === "object") {
              for (const [k, v] of Object.entries(item)) {
                entries.push({ key: k.trim(), value: String(v).trim() });
              }
            }
          }
          return entries;
        }
        if (typeof form === "object") {
          const entries: { key: string; value: string }[] = [];
          for (const [k, v] of Object.entries(form)) {
            if (!isNaN(parseInt(k, 10)) && typeof v === "string") {
              const trimmed = v.trim();
              const eqIdx = trimmed.indexOf("=");
              if (eqIdx === -1) {
                entries.push({ key: trimmed, value: "" });
              } else {
                entries.push({
                  key: trimmed.slice(0, eqIdx).trim(),
                  value: trimmed.slice(eqIdx + 1).trim(),
                });
              }
            } else {
              entries.push({ key: k.trim(), value: String(v).trim() });
            }
          }
          return entries;
        }
        return [];
      };

      // 1. Detect audio field name from the raw curl form entries
      // E.g. `-F "audio={{AUDIO}}"` -> "audio", `-F "file={{AUDIO}}"` -> "file"
      const rawFormEntries = parseFormEntries(curlJson.form);
      let audioFieldName = "file"; // fallback default
      const detectedAudio = rawFormEntries.find(
        (entry) =>
          entry.value.toUpperCase().includes("AUDIO") ||
          ["audio", "file", "data_file", "media"].includes(
            entry.key.toLowerCase()
          )
      );
      if (detectedAudio && detectedAudio.key) {
        audioFieldName = detectedAudio.key;
      }

      // 2. Append audio blob under detected field name
      const form = new FormData();
      const mimeType = audio.type || "audio/wav";
      const filename = (audio as File)?.name || "audio.wav";
      const freshBlob = new Blob([await audio.arrayBuffer()], {
        type: mimeType,
      });
      form.append(audioFieldName, freshBlob, filename);

      // 3. Append remaining form fields
      const headerKeys = Object.keys(headers).map((k) =>
        k.toUpperCase().replace(/[-_]/g, "")
      );
      const processedFormEntries = parseFormEntries(formData);
      for (const entry of processedFormEntries) {
        const lowerKey = entry.key.toLowerCase();
        // Skip audio field since it was already appended
        if (
          lowerKey === audioFieldName.toLowerCase() ||
          lowerKey === "file" ||
          lowerKey === "audio" ||
          lowerKey === "data_file" ||
          lowerKey === "media"
        ) {
          continue;
        }

        if (
          !entry.value ||
          headerKeys.includes(entry.key.toUpperCase().replace(/[-_]/g, ""))
        ) {
          continue;
        }

        form.append(entry.key, entry.value);
      }

      delete finalHeaders["Content-Type"];
      delete finalHeaders["content-type"];
      body = form;
    } else if (isBinaryUpload) {
      // Deepgram-style: raw binary body
      body = new Blob([await audio.arrayBuffer()], {
        type: audio.type,
      });
    } else {
      // Google-style: JSON payload with base64
      allVariables.AUDIO = await blobToBase64(audio);
      const dataObj = curlJson.data ? { ...curlJson.data } : {};
      body = JSON.stringify(deepVariableReplacer(dataObj, allVariables));
    }

    // Always use tauriFetch (Tauri HTTP plugin) — native browser fetch is blocked
    // by the WebView CSP on Windows/Linux for cross-origin STT API requests.
    const fetchFunction = tauriFetch;

    // Send request
    let response: Response;
    try {
      response = await fetchFunction(url, {
        method: curlJson.method || "POST",
        headers: finalHeaders,
        body: curlJson.method === "GET" ? undefined : body,
      });
    } catch (e) {
      throw new Error(`Network error: ${e instanceof Error ? e.message : e}`);
    }

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch {}
      let errMsg: string = errText;
      try {
        const errObj = JSON.parse(errText);
        if (errObj?.error?.message) {
          errMsg = errObj.error.message;
        } else if (errObj?.message) {
          errMsg = errObj.message;
        } else if (errObj?.detail || errObj?.details) {
          const detailStr = errObj.detail || errObj.details;
          errMsg = errObj.title ? `${errObj.title}: ${detailStr}` : detailStr;
        }
      } catch {
        errMsg = errText || response.statusText;
      }

      if (url.includes("speech.googleapis.com") && errMsg.includes("API key not valid")) {
        errMsg = "Google Speech-to-Text API key is invalid. Please make sure you are using a Google Cloud API key (from console.cloud.google.com) with the 'Cloud Speech-to-Text API' enabled, rather than a Google AI Studio (Gemini) key.";
      }

      throw new Error(`HTTP ${response.status}: ${errMsg}`);
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return [...warnings, responseText.trim()].filter(Boolean).join("; ");
    }

    // Extract transcription
    const rawPath = provider.responseContentPath || "text";
    const path = rawPath.charAt(0).toLowerCase() + rawPath.slice(1);
    const transcription = (getByPath(data, path) || "").trim();

    if (!transcription) {
      return [...warnings, "No transcription found"].join("; ");
    }

    // Return transcription with any warnings
    return [...warnings, transcription].filter(Boolean).join("; ");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }
}
