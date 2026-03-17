function formatLap(lap, lapsToWin) {
  const visibleLap = Math.min(lapsToWin, lap + 1);
  return `${visibleLap}/${lapsToWin}`;
}

function HudOverlay({ speed, lap, lapsToWin, position, totalPlayers, nitro, leaderboard }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="glass rounded-xl px-4 py-3">
          <p className="font-display text-xs uppercase tracking-[0.15em] text-cyan-200/90">Speed</p>
          <p className="font-display text-3xl text-white">{Math.max(0, speed).toFixed(0)} km/h</p>
        </div>
        <div className="glass rounded-xl px-4 py-3 text-right">
          <p className="font-display text-xs uppercase tracking-[0.15em] text-cyan-200/90">Lap</p>
          <p className="font-display text-3xl text-white">{formatLap(lap, lapsToWin)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="glass min-w-[180px] rounded-xl px-4 py-3">
          <p className="font-display text-xs uppercase tracking-[0.15em] text-cyan-200/90">Position</p>
          <p className="font-display text-3xl text-white">
            {position}/{totalPlayers}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800/70">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-teal-300"
              style={{ width: `${Math.max(0, Math.min(100, nitro))}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-cyan-100">Nitro: {nitro.toFixed(0)}%</p>
        </div>

        <div className="glass w-[220px] rounded-xl px-4 py-3">
          <p className="font-display text-xs uppercase tracking-[0.15em] text-cyan-200/90">Mini Leaderboard</p>
          <ol className="mt-2 space-y-1 text-sm">
            {leaderboard.slice(0, 5).map((player) => (
              <li key={player.id} className="flex items-center justify-between text-cyan-50">
                <span className="truncate">
                  {player.rank}. {player.username}
                </span>
                <span>{player.lap}/{lapsToWin}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default HudOverlay;
