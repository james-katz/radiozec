import { usePlayerStore } from '../../stores/playerStore';
import type { QueueItem } from '../../stores/playerStore';

export default function QueueDisplay() {
  const { queue, playback } = usePlayerStore();
  const current = playback.currentItem;

  return (
    <div className="flex flex-col gap-2">
      {/* Now Playing */}
      {current && (
        <div className="glass-card p-3 border-l-3 border-gold-500 animate-fade-in">
          <div className="flex items-center gap-3">
            <img
              src={current.thumbnail}
              alt={current.title}
              className="w-14 h-10 rounded object-cover flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gold-400 uppercase tracking-wider mb-0.5">
                Now Playing
              </p>
              <p className="text-sm text-base-100 truncate font-medium">
                {current.title}
              </p>
              <p className="text-xs text-base-400">
                {current.isFallback ? '📻 RadioZec Playlist' : `Requested by ${current.requestedBy}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Queue Items */}
      {queue.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-base-400 uppercase tracking-wider px-1">
            Up Next ({queue.length})
          </p>
          {queue.slice(0, 5).map((item, idx) => (
            <QueueItemCard key={item.id} item={item} position={idx + 1} />
          ))}
          {queue.length > 5 && (
            <p className="text-xs text-base-500 text-center py-1">
              +{queue.length - 5} more in queue
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-base-500 text-center py-2">
          Queue empty — playing from default playlist
        </p>
      )}
    </div>
  );
}

function QueueItemCard({ item, position }: { item: QueueItem; position: number }) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-base-800/50 hover:bg-base-700/50 transition-colors animate-slide-up">
      <span className="text-xs text-base-500 font-mono w-4 text-center flex-shrink-0">
        {position}
      </span>
      <img
        src={item.thumbnail}
        alt={item.title}
        className="w-10 h-7 rounded object-cover flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-base-200 truncate">{item.title}</p>
        <p className="text-[10px] text-base-500">
          {item.donationAmount > 0 && `${item.donationAmount} ZEC`}
        </p>
      </div>
    </div>
  );
}
