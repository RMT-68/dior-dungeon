import React from "react";
import { useLanguage } from "../context/LanguageContext";

// Component defined OUTSIDE the main component to avoid "Cannot create components during render" error
const PlayerCard = ({ player, isMe }) => {
  const { t } = useLanguage();

  // Safe calculation for bars
  const maxHP = parseInt(player.character_data?.maxHP) || 100;
  const currentHP = player.current_hp !== undefined ? player.current_hp : 100;
  const hpPercentage = Math.min(100, Math.max(0, (currentHP / maxHP) * 100));

  const maxStamina = parseInt(player.character_data?.maxStamina) || 100;
  const currentStamina =
    player.current_stamina !== undefined ? player.current_stamina : 100;
  const staminaPercentage = Math.min(
    100,
    Math.max(0, (currentStamina / maxStamina) * 100),
  );

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all ${
        isMe
          ? "bg-gradient-to-br from-slate-800 to-slate-900 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)] mb-6 transform scale-105"
          : "bg-slate-900/50 border-slate-700/50 hover:bg-slate-800/80 mb-3"
      }`}
    >
      {/* Header: Name & Role */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3
            className={`font-bold text-lg ${isMe ? "text-amber-400" : "text-slate-200"}`}
          >
            {player.username}{" "}
            {isMe && (
              <span className="text-xs text-slate-500 ml-1">
                ({t("common.you")})
              </span>
            )}
          </h3>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold bg-slate-950/50 px-2 py-0.5 rounded border border-slate-800">
            {player.character_data?.role || t("game.adventurer")}
          </span>
        </div>

        {/* Status Badges */}
        <div className="flex flex-col items-end gap-1">
          {!player.is_alive && (
            <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded border border-red-900">
              {t("game.dead")}
            </span>
          )}
          <span
            className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider border ${
              player.is_ready
                ? "bg-emerald-900/30 text-emerald-400 border-emerald-500/20"
                : "bg-amber-900/20 text-amber-500 border-amber-500/20"
            }`}
          >
            {player.is_ready ? t("game.ready") : t("game.waiting")}
          </span>
        </div>
      </div>

      {/* Stats Bars */}
      <div className="space-y-2">
        {/* HP Bar */}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-6 font-bold text-red-400">{t("game.hp")}</span>
          <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-500"
              style={{
                width: `${hpPercentage}%`,
              }}
            />
          </div>
          <span className="w-8 text-right text-slate-400">{currentHP}</span>
        </div>

        {/* Stamina Bar */}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-6 font-bold text-green-400">{t("game.stm")}</span>
          <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{
                width: `${staminaPercentage}%`,
              }}
            />
          </div>
          <span className="w-8 text-right text-slate-400">
            {currentStamina}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function PlayerList({ players = [], currentPlayerId }) {
  const { t } = useLanguage();

  // Ensure players is always an array to prevent crashes
  const safePlayers = Array.isArray(players) ? players : [];

  const me = safePlayers.find((p) => p.id === currentPlayerId);
  const others = safePlayers.filter((p) => p.id !== currentPlayerId);

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-900">
      <div className="p-4 border-b border-slate-900">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">
          {t("game.partyRoster")}
        </h2>
        {me && <PlayerCard player={me} isMe={true} />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {others.length > 0 ? (
          <>
            <div className="text-xs uppercase tracking-widest text-slate-600 font-semibold mb-3 px-1">
              {t("game.allies")}
            </div>
            {others.map((p) => (
              <PlayerCard key={p.id} player={p} isMe={false} />
            ))}
          </>
        ) : (
          <div className="text-center py-10 text-slate-600 italic text-sm">
            {t("game.noAllies")}
          </div>
        )}
      </div>
    </div>
  );
}
