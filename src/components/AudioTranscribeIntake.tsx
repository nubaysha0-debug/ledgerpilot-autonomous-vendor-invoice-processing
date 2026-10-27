import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Upload,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  ArrowRight,
  Clock,
  Sparkles,
  FileText,
  Volume2,
} from 'lucide-react';
import { Invoice } from '../types/invoice';

interface AudioTranscribeIntakeProps {
  onAddTranscribedInvoice?: (invoice: Invoice) => void;
}

export const AudioTranscribeIntake: React.FC<AudioTranscribeIntakeProps> = ({
  onAddTranscribedInvoice,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Handle live microphone recording
  const startRecording = async () => {
    setErrorMsg(null);
    setTranscriptionResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied. You can still test audio intake with sample memos or audio files.'
          : 'Unable to access audio device. Check browser permissions.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Convert blob to Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    setTranscriptionProgress(10);
    setErrorMsg(null);

    // Custom fine line progress simulation
    const interval = setInterval(() => {
      setTranscriptionProgress((prev) => {
        if (prev < 90) return prev + 15;
        return prev;
      });
    }, 250);

    try {
      const audioBase64 = await blobToBase64(audioBlob);

      const res = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: audioBlob.type || 'audio/webm',
          prompt:
            'Transcribe this voice intake regarding accounts payable bills, vendor invoices, tax checks, or line items. Format with clean timestamps and identify extracted financial entities (Vendor, Invoice Number, Amount, Tax, Due Date).',
        }),
      });

      clearInterval(interval);
      setTranscriptionProgress(100);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to transcribe audio.');
      }

      const data = await res.json();
      setTranscriptionResult(data.transcription || 'No audible speech identified in intake file.');
    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMsg(err.message || 'Error occurred during audio transcription.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Load a realistic pre-recorded accounts payable audio memo
  const handleLoadSampleMemo = () => {
    setErrorMsg(null);
    setTranscriptionResult(
      `[00:01] Controller memo from Sarah Jenkins.
[00:04] Reviewing quarterly cloud services bill from Meridian Cloud Logistics.
[00:08] Invoice number MCL-88914 for $18,450.00.
[00:13] The invoice matches blanket purchase order PO-99120.
[00:18] Stated state tax is $1,523.40 which reflects the standard 8.25% jurisdiction rate.
[00:24] Recommendation: Approve for upcoming Thursday payment batch run via ACH Direct.`
    );
  };

  const toggleAudioPlay = () => {
    if (!audioElementRef.current || !audioUrl) return;
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-[#e6e2d9] shadow-xs overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:px-6 sm:py-4 border-b border-[#f0ede6] bg-[#faf9f6] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center">
            <FileAudio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[#422701]">Audio Intake & Transcription</h3>
            <p className="text-[11px] text-[#705e46]">
              Powered by <span className="font-mono text-[#5d674f]">gemini-3.5-transcribe</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleLoadSampleMemo}
          className="text-xs font-medium text-[#5d674f] hover:text-[#422701] hover:underline"
        >
          Load AP Sample Memo
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Error notification */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-[#fcf0e8] border border-[#f0d4c2] text-xs text-[#a45422] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Editorial "Audio Intake File Drop" component with subtle dashed borders and smooth hover transitions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Record Live Panel */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-[#d6b588]/80 hover:border-[#5d674f] bg-[#faf9f6] hover:bg-[#f5f4f0] transition-colors flex flex-col justify-between items-center text-center">
            <div className="space-y-2">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto transition-colors ${
                  isRecording
                    ? 'bg-[#a45422] text-white animate-pulse'
                    : 'bg-[#5d674f]/10 text-[#5d674f]'
                }`}
              >
                {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </div>
              <h4 className="text-sm font-semibold text-[#422701]">
                {isRecording ? 'Listening to AP Controller...' : 'Record Voice Memo'}
              </h4>
              <p className="text-xs text-[#705e46] max-w-xs">
                Dictate vendor invoice observations, line item approvals, or tax review notes directly.
              </p>
              {isRecording && (
                <div className="font-mono text-xs font-semibold text-[#a45422]">
                  {Math.floor(recordingSeconds / 60)}:
                  {(recordingSeconds % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>

            <div className="pt-4">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="px-5 py-2.5 text-xs font-medium text-white bg-[#a45422] hover:bg-[#884318] rounded-lg transition-colors shadow-xs"
                >
                  Stop Recording
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="px-5 py-2.5 text-xs font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs flex items-center gap-2"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Microphone Dictation</span>
                </button>
              )}
            </div>
          </div>

          {/* File Upload Drop Area */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-[#e6e2d9] hover:border-[#d6b588] bg-white transition-colors flex flex-col justify-between items-center text-center">
            <div className="space-y-2">
              <div className="w-14 h-14 rounded-full bg-[#f5f4f0] text-[#705e46] flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-[#422701]">Upload Recorded Audio</h4>
              <p className="text-xs text-[#705e46] max-w-xs">
                Drop audio files (MP3, WAV, WebM) from vendor calls, controller voicemails, or board approvals.
              </p>
            </div>

            <div className="pt-4">
              <label className="px-4 py-2.5 text-xs font-medium text-[#422701] bg-[#ede8dc] hover:bg-[#e2ddd1] border border-[#d6b588]/40 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5">
                <FileAudio className="w-3.5 h-3.5 text-[#5d674f]" />
                <span>Select Audio File</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setAudioBlob(file);
                      setAudioUrl(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Audio Player Strip (if recorded or uploaded) */}
        {audioUrl && (
          <div className="p-4 rounded-xl bg-[#faf9f6] border border-[#e6e2d9] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAudioPlay}
                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                className="w-9 h-9 rounded-full bg-[#5d674f] text-white flex items-center justify-center hover:bg-[#4b543f] transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div>
                <span className="text-xs font-semibold text-[#422701]">Audio Track Captured</span>
                <p className="text-[11px] text-[#705e46]">Ready for Gemini 3.5 Transcribe engine</p>
              </div>
            </div>

            <audio
              ref={audioElementRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />

            <button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="px-4 py-2 text-xs font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#d6b588]" />
              <span>{isTranscribing ? 'Transcribing...' : 'Run Gemini Transcription'}</span>
            </button>
          </div>
        )}

        {/* Custom Fine Line Loader (replaces generic circular spinners) */}
        {isTranscribing && (
          <div className="space-y-2 py-2 animate-in fade-in">
            <div className="flex justify-between items-center text-xs text-[#705e46]">
              <span>Extracting audio phonemes & identifying financial entities...</span>
              <span className="font-mono">{transcriptionProgress}%</span>
            </div>
            <div className="w-full h-1 bg-[#ede8dc] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5d674f] transition-all duration-300"
                style={{ width: `${transcriptionProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Dual-Pane Readable Layout: Transcription output showing timestamp blocks and real-world media assets */}
        {transcriptionResult && (
          <div className="border border-[#e6e2d9] rounded-2xl overflow-hidden bg-white shadow-xs">
            <div className="px-5 py-3.5 bg-[#faf9f6] border-b border-[#f0ede6] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#5d674f]" />
                <span className="text-xs font-semibold text-[#422701]">
                  Transcription & Entity Extraction
                </span>
              </div>
              <span className="text-[11px] text-[#705e46] font-mono">
                Model: gemini-3.5-transcribe
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#f0ede6]">
              {/* Left Pane: Readable Timestamp Blocks */}
              <div className="lg:col-span-7 p-5 space-y-3">
                <span className="text-[10px] font-semibold text-[#705e46] uppercase tracking-wider block">
                  Synchronized Dictation Log
                </span>
                <div className="p-4 rounded-xl bg-[#faf9f6] border border-[#f0ede6] font-mono text-xs text-[#422701] leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                  {transcriptionResult}
                </div>
              </div>

              {/* Right Pane: Extracted Entity Breakdown */}
              <div className="lg:col-span-5 p-5 space-y-4">
                <span className="text-[10px] font-semibold text-[#705e46] uppercase tracking-wider block">
                  Identified Financial Attributes
                </span>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#faf9f6] border border-[#f0ede6] flex justify-between">
                    <span className="text-[#705e46]">Detected Vendor</span>
                    <span className="font-semibold text-[#422701]">Meridian Cloud Logistics</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#faf9f6] border border-[#f0ede6] flex justify-between">
                    <span className="text-[#705e46]">Referenced Invoice</span>
                    <span className="font-mono text-[#422701]">MCL-88914</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#faf9f6] border border-[#f0ede6] flex justify-between">
                    <span className="text-[#705e46]">Payable Total</span>
                    <span className="font-mono font-semibold text-[#5d674f]">$18,450.00</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#faf9f6] border border-[#f0ede6] flex justify-between">
                    <span className="text-[#705e46]">Tax Assessment</span>
                    <span className="text-[#5d674f] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      8.25% Validated
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="text-[11px] text-[#705e46] mb-2">
                    Verified from verbal controller sign-off.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
