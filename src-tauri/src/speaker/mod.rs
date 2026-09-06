use anyhow::Result;
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos::{SpeakerInput as PlatformSpeakerInput, SpeakerStream as PlatformSpeakerStream};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows::{SpeakerInput as PlatformSpeakerInput, SpeakerStream as PlatformSpeakerStream};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux::{SpeakerInput as PlatformSpeakerInput, SpeakerStream as PlatformSpeakerStream};

mod commands;

// Re-export commands for tauri handler
pub use commands::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
pub(crate) fn list_input_devices() -> Result<Vec<AudioDevice>> {
    #[cfg(target_os = "macos")]
    return macos::get_input_devices();

    #[cfg(target_os = "windows")]
    return windows::get_input_devices();

    #[cfg(target_os = "linux")]
    return linux::get_input_devices();
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
pub(crate) fn list_output_devices() -> Result<Vec<AudioDevice>> {
    #[cfg(target_os = "macos")]
    return macos::get_output_devices();

    #[cfg(target_os = "windows")]
    return windows::get_output_devices();

    #[cfg(target_os = "linux")]
    return linux::get_output_devices();
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub(crate) fn list_input_devices() -> Result<Vec<AudioDevice>> {
    Ok(vec![])
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub(crate) fn list_output_devices() -> Result<Vec<AudioDevice>> {
    Ok(vec![])
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioSource {
    #[serde(rename = "mic")]
    Microphone,
    #[serde(rename = "speaker")]
    Speaker,
}

impl AudioSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            AudioSource::Microphone => "mic",
            AudioSource::Speaker => "speaker",
        }
    }
}

// Pluely speaker input and stream
pub struct SpeakerInput {
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    inner: PlatformSpeakerInput,
}

impl SpeakerInput {
    // Creates a new speaker input. Fails on unsupported platforms.
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    pub fn new() -> Result<Self> {
        let inner = PlatformSpeakerInput::new(None)?;
        Ok(Self { inner })
    }

    // Creates a new speaker input with a specific device ID
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    pub fn new_with_device(device_id: Option<String>) -> Result<Self> {
        let inner = PlatformSpeakerInput::new(device_id)?;
        Ok(Self { inner })
    }

    // Creates a new speaker input with a specific source (mic or speaker) and device ID
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    pub fn new_with_source(source: AudioSource, device_id: Option<String>) -> Result<Self> {
        let inner = PlatformSpeakerInput::new_with_source(source, device_id)?;
        Ok(Self { inner })
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    pub fn new() -> Result<Self> {
        Err(anyhow::anyhow!(
            "SpeakerInput::new is not supported on this platform"
        ))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    pub fn new_with_device(_device_id: Option<String>) -> Result<Self> {
        Err(anyhow::anyhow!(
            "SpeakerInput::new_with_device is not supported on this platform"
        ))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    pub fn new_with_source(_source: AudioSource, _device_id: Option<String>) -> Result<Self> {
        Err(anyhow::anyhow!(
            "SpeakerInput::new_with_source is not supported on this platform"
        ))
    }


    // Starts the audio stream.
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    pub fn stream(self) -> SpeakerStream {
        let inner = self.inner.stream();
        SpeakerStream { inner }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    pub fn stream(self) -> SpeakerStream {
        unimplemented!("SpeakerInput::stream is not supported on this platform")
    }
}

// Stream of f32 audio samples from the speaker.
pub struct SpeakerStream {
    inner: PlatformSpeakerStream,
}

impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        {
            Pin::new(&mut self.inner).poll_next(cx)
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            std::task::Poll::Pending
        }
    }
}

impl SpeakerStream {
    // Gets the sample rate (e.g., 16000 Hz on stub, variable on real impls).
    pub fn sample_rate(&self) -> u32 {
        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        return self.inner.sample_rate();

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_source_as_str() {
        assert_eq!(AudioSource::Microphone.as_str(), "mic");
        assert_eq!(AudioSource::Speaker.as_str(), "speaker");
    }

    #[test]
    fn test_speech_detected_payload_serialization() {
        let payload = SpeechDetectedPayload {
            audio: "base64audio".to_string(),
            source: AudioSource::Microphone.as_str().to_string(),
        };
        let json = serde_json::to_string(&payload).expect("Serialization failed");
        assert!(json.contains("\"source\":\"mic\""));
        assert!(json.contains("\"audio\":\"base64audio\""));

        let payload_speaker = SpeechDetectedPayload {
            audio: "data".to_string(),
            source: AudioSource::Speaker.as_str().to_string(),
        };
        let json_speaker = serde_json::to_string(&payload_speaker).expect("Serialization failed");
        assert!(json_speaker.contains("\"source\":\"speaker\""));

        let deserialized: SpeechDetectedPayload =
            serde_json::from_str(&json_speaker).expect("Deserialization failed");
        assert_eq!(deserialized.source, "speaker");
        assert_eq!(deserialized.audio, "data");
    }
}

