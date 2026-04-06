import React, { useEffect, useRef, useState } from 'react';

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  lang?: string;
  className?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  disabled = false,
  lang = 'tr-TR',
  className = '',
}) => {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [isListening, setIsListening] = useState(false);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const startListening = () => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal && result[0]?.transcript) {
          transcript += result[0].transcript;
        }
      }

      const normalized = transcript.trim();
      if (normalized) {
        onTranscript(normalized);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <button
      type="button"
      onClick={isListening ? stopListening : startListening}
      disabled={disabled || !isSupported}
      title={
        !isSupported
          ? 'Tarayici sesli girisi desteklemiyor'
          : isListening
            ? 'Sesli girisi durdur'
            : 'Sesli giris baslat'
      }
      aria-label={
        !isSupported
          ? 'Tarayici sesli girisi desteklemiyor'
          : isListening
            ? 'Sesli girisi durdur'
            : 'Sesli giris baslat'
      }
      className={`inline-flex items-center justify-center p-2 rounded-lg border transition-colors ${
        isListening
          ? 'bg-red-600/20 border-red-500/50 text-red-300'
          : 'bg-gray-700/70 border-gray-600 text-gray-200 hover:bg-gray-600'
      } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {isListening ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 5h12v14H6z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z" />
          <path d="M18 11a1 1 0 10-2 0 4 4 0 11-8 0 1 1 0 10-2 0 6 6 0 005 5.91V20H9a1 1 0 100 2h6a1 1 0 100-2h-2v-3.09A6 6 0 0018 11z" />
        </svg>
      )}
    </button>
  );
};
