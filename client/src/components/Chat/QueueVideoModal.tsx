import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getSocket } from '../../hooks/useSocket';

interface Props {
  onClose: () => void;
  type: 'queue' | 'skip';
}

interface PaymentInfo {
  uri: string;
  amount: number;
  address: string;
  video?: {
    videoId: string;
    title: string;
    thumbnail: string;
    authorName: string;
  };
  error?: string;
}

export default function QueueVideoModal({ onClose, type }: Props) {
  const [url, setUrl] = useState('');
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const socket = getSocket();

  useEffect(() => {
    const handlePayment = (data: PaymentInfo) => {
      setLoading(false);
      if (data.error) {
        setError(data.error);
      } else {
        setPayment(data);
      }
    };

    if (type === 'queue') {
      socket.on('queue:payment', handlePayment);
    } else {
      socket.on('skip:payment', handlePayment);
      // Auto-request skip payment
      socket.emit('skip:request');
      setLoading(true);
    }

    return () => {
      socket.off('queue:payment', handlePayment);
      socket.off('skip:payment', handlePayment);
    };
  }, [socket, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    socket.emit('queue:request', { youtubeUrl: url.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="glass-card p-6 w-full max-w-md mx-4 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-base-100">
            {type === 'queue' ? '🎵 Queue a Video' : '⏭ Skip Current Video'}
          </h2>
          <button onClick={onClose} className="text-base-400 hover:text-base-200 transition-colors text-xl">
            ✕
          </button>
        </div>

        {/* Queue URL Input */}
        {type === 'queue' && !payment && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm text-base-300">
              Paste a YouTube URL below. A QR code with a Zcash payment URI will be generated for you.
            </p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full bg-base-800 text-sm text-base-100 px-4 py-3 rounded-lg border border-base-600 focus:border-gold-500 focus:outline-none placeholder:text-base-500 transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-xs text-rose-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 text-base-950 font-bold text-sm hover:from-gold-500 hover:to-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? 'Fetching video info...' : 'Generate Payment QR'}
            </button>
          </form>
        )}

        {/* Loading for skip */}
        {type === 'skip' && !payment && loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-3 border-gold-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Payment Display */}
        {payment && (
          <div className="space-y-4 animate-fade-in">
            {/* Video Preview */}
            {payment.video && (
              <div className="flex items-center gap-3 p-3 bg-base-800 rounded-lg">
                <img
                  src={payment.video.thumbnail}
                  alt={payment.video.title}
                  className="w-16 h-12 rounded object-cover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-base-100 truncate">{payment.video.title}</p>
                  <p className="text-xs text-base-400">{payment.video.authorName}</p>
                </div>
              </div>
            )}

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG
                  value={payment.uri}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0b0f"
                />
              </div>
              <p className="text-center">
                <span className="text-gold-400 font-bold text-xl">{payment.amount} ZEC</span>
              </p>
              <p className="text-xs text-base-400 text-center">
                Scan with your Zcash wallet to {type === 'queue' ? 'queue this video' : 'skip the current video'}
              </p>
            </div>

            {/* URI Copy */}
            <div className="bg-base-800 rounded-lg p-3">
              <p className="text-[10px] text-base-500 mb-1 font-medium uppercase tracking-wider">Payment URI</p>
              <p className="text-xs text-base-300 break-all font-mono leading-relaxed select-all">
                {payment.uri}
              </p>
            </div>

            <button
              onClick={() => navigator.clipboard.writeText(payment.uri)}
              className="w-full py-2.5 rounded-lg bg-base-700 text-base-200 text-sm font-medium hover:bg-base-600 transition-all active:scale-[0.98] border border-base-600"
            >
              📋 Copy Payment URI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
