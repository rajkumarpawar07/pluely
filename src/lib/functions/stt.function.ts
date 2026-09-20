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
      // Detect the audio field name from the raw curl template.
      // e.g. `-F "file={{AUDIO}}"` → "file", `-F "audio={{AUDIO}}"` → "audio"
      const rawCurlForm = curlJson.form || {};
      let audioFieldName = "file"; // default (OpenAI, Groq, ElevenLabs...)
      for (const [k, v] of Object.entries(rawCurlForm)) {
        const strVal = String(v);
        if (!isNaN(parseInt(k, 10))) {
          // Numeric key style: "audio={{AUDIO}}" or "file={{AUDIO}}"
          const [formKey, ...rest] = strVal.split("=");
          const formVal = rest.join("=");
          if (formVal.includes("AUDIO") || formVal.trim() === "") {
            audioFieldName = formKey.toLowerCase().trim();
            break;
          }
        } else {
          // Named key style: { audio: "{{AUDIO}}" }
          if (strVal.includes("AUDIO") || strVal.trim() === "") {
            audioFieldName = k.toLowerCase().trim();
            break;
          }
        }
      }

      const form = new FormData();
      const freshBlob = new Blob([await audio.arrayBuffer()], {
        type: audio.type,
      });
      form.append(audioFieldName, freshBlob, "audio.wav");
      const headerKeys = Object.keys(headers).map((k) =>
        k.toUpperCase().replace(/[-_]/g, "")
      );

      for (const [key, val] of Object.entries(formData)) {
        if (typeof val !== "string") {
          if (
            !val ||
            headerKeys.includes(key.toUpperCase()) ||
            key.toUpperCase() === "AUDIO"
          )
            continue;
          form.append(key.toLowerCase(), val as string | Blob);
          continue;
        }

        // Check if key is a number, which indicates array-like parsing from curl2json
        if (!isNaN(parseInt(key, 10))) {
          const [formKey, ...formValueParts] = val.split("=");
          const formValue = formValueParts.join("=");

          // Skip the audio field — already appended above with detected name
          if (formKey.toLowerCase() === audioFieldName) continue;
          if (formKey.toLowerCase() === "file") continue;

          if (
            !formValue ||
            headerKeys.includes(formKey.toUpperCase().replace(/[-_]/g, ""))
          )
            continue;

          form.append(formKey, formValue);
        } else {
          // Skip the audio field — already appended above with detected name
          if (key.toLowerCase() === audioFieldName) continue;
          if (key.toLowerCase() === "file") continue;
          if (
            !val ||
            headerKeys.includes(key.toUpperCase()) ||
            key.toUpperCase() === "AUDIO"
          )
            continue;
          form.append(key.toLowerCase(), val as string | Blob);
        }
      }
      delete finalHeaders["Content-Type"];
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
