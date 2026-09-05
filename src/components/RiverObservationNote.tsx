import { getPollutantLabel, type CustomPollutantProfile, type PollutantType } from '../engine/simulation';

interface RiverObservationNoteProps {
  light: number;
  turbidity: number;
  temperature: number;
  finalConcentration: number;
  pollutantType: PollutantType;
  customPollutants?: Record<string, CustomPollutantProfile>;
}

function buildNote({
  light,
  turbidity,
  temperature,
  finalConcentration,
  pollutantType,
  customPollutants,
}: RiverObservationNoteProps): { title: string; body: string; tone: string } {
  if (light <= 0.2) {
    return {
      title: '夜间观察',
      body: '现在几乎没有阳光参与，净化主要靠水体自己的慢慢恢复。可以先把投药点放在水流慢一点的位置，别急着猛加剂量。',
      tone: 'note-cool',
    };
  }

  if (turbidity >= 70) {
    return {
      title: '雨后浑水提醒',
      body: '这会儿像刚下过大雨，上游带下来的泥沙比较多，光很难照到水下。普通人看就是水发黄，系统里会表现为净化变慢。',
      tone: 'note-warm',
    };
  }

  if (finalConcentration <= 0.12) {
    return {
      title: '出水口不错',
      body: '下游水色已经明显变清，当前方案比较稳。可以试着少放一点催化剂，看看是不是还能保持达标。',
      tone: 'note-clear',
    };
  }

  if (temperature <= 8) {
    return {
      title: '低温慢反应',
      body: '水温偏低时，很多反应都会变慢。冬季河道治理常见的感觉就是：看着平静，但恢复速度不快。',
      tone: 'note-cool',
    };
  }

  if (pollutantType === 'microplastic') {
    return {
      title: '隐形污染',
      body: '微塑料不一定让水看起来浑，但它很难自己消失。这里可以多关注停留时间长的河段，而不只看水色。',
      tone: 'note-clear',
    };
  }

  return {
    title: '今日河道小记',
    body: `当前主要关注 ${getPollutantLabel(pollutantType, customPollutants)}。先调“水有多浑”和“阳光强不强”，再观察出水口残留变化，会比直接看公式更直观。`,
    tone: 'note-clear',
  };
}

export function RiverObservationNote(props: RiverObservationNoteProps) {
  const note = buildNote(props);

  return (
    <aside className={`river-note ${note.tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">河流观察笔记</p>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          社区巡河
        </span>
      </div>
      <h3 className="mt-2 text-sm font-bold text-slate-800">{note.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{note.body}</p>
    </aside>
  );
}
