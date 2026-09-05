interface WeatherWaterStatusProps {
  light: number;
  turbidity: number;
  temperature: number;
  backendOnline: boolean;
}

function getSkyStatus(light: number, turbidity: number) {
  if (light <= 0.2) return { label: '夜间水面', tone: 'bg-slate-500/20 text-slate-100 border-slate-300/20', dot: 'bg-slate-300' };
  if (turbidity >= 70) return { label: '雨后浑水', tone: 'bg-orange-500/15 text-orange-100 border-orange-200/25', dot: 'bg-orange-300' };
  if (light >= 7) return { label: '晴朗强光', tone: 'bg-sky-400/15 text-sky-100 border-sky-200/30', dot: 'bg-sky-200' };
  if (light >= 3) return { label: '多云有光', tone: 'bg-emerald-400/15 text-emerald-100 border-emerald-200/25', dot: 'bg-emerald-300' };
  return { label: '阴天弱光', tone: 'bg-slate-400/15 text-slate-100 border-slate-200/20', dot: 'bg-slate-300' };
}

function getWaterStatus(turbidity: number) {
  if (turbidity <= 10) return '水体偏清';
  if (turbidity <= 35) return '轻微浑浊';
  if (turbidity <= 70) return '明显浑浊';
  return '泥沙偏重';
}

export function WeatherWaterStatus({ light, turbidity, temperature, backendOnline }: WeatherWaterStatusProps) {
  const sky = getSkyStatus(light, turbidity);

  return (
    <div className="water-status-widget flex items-center gap-2 rounded-xl border px-3 py-2 shadow-lg shadow-sky-950/20">
      <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${sky.tone}`}>
        <span className={`status-breath h-2 w-2 rounded-full ${sky.dot}`} />
        {sky.label}
      </div>
      <div className="hidden sm:flex items-center gap-2 text-xs text-sky-100/85">
        <span>{getWaterStatus(turbidity)}</span>
        <span className="text-sky-200/30">|</span>
        <span>{temperature.toFixed(0)}°C</span>
        <span className="text-sky-200/30">|</span>
        <span className={backendOnline ? 'text-emerald-200' : 'text-orange-200'}>
          {backendOnline ? '云端可用' : '本地运行'}
        </span>
      </div>
    </div>
  );
}
