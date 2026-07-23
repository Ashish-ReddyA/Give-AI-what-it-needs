"use client";

import {
  VideoSpec,
  AspectFormat,
  VideoDuration,
  CameraMotion,
  FORMAT_LABELS,
  DURATION_LABELS,
  MOTION_LABELS,
} from "@/lib/types";
import { FieldLabel, ChoiceButton, TextField } from "./fields";

interface Props {
  spec: VideoSpec;
  onChange: (next: VideoSpec) => void;
}

export default function VideoQuestionFlow({ spec, onChange }: Props) {
  const set = <K extends keyof VideoSpec>(key: K, value: VideoSpec[K]) =>
    onChange({ ...spec, [key]: value });

  return (
    <div className="space-y-6">
      <div>
        <FieldLabel number="00">Base idea</FieldLabel>
        <textarea
          value={spec.idea}
          onChange={(e) => set("idea", e.target.value)}
          placeholder="e.g. a barista pouring latte art in a sunlit cafe"
          rows={2}
          className="w-full bg-paperRaised border border-line rounded-sm px-3 py-2 text-sm font-body text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink resize-none"
        />
      </div>

      <div>
        <FieldLabel number="01">Format</FieldLabel>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(FORMAT_LABELS) as AspectFormat[]).map((f) => (
            <ChoiceButton
              key={f}
              active={spec.format === f}
              onClick={() => set("format", f)}
            >
              {FORMAT_LABELS[f]}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel number="02">Duration</FieldLabel>
        <p className="text-xs text-inkMuted mb-2 font-body">
          Longer clips cost more credits — pick what you&apos;ll actually use.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DURATION_LABELS) as VideoDuration[]).map((d) => (
            <ChoiceButton
              key={d}
              active={spec.duration === d}
              onClick={() => set("duration", d)}
            >
              {DURATION_LABELS[d]}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel number="03">Camera motion</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MOTION_LABELS) as CameraMotion[]).map((m) => (
            <ChoiceButton
              key={m}
              active={spec.motion === m}
              onClick={() => set("motion", m)}
            >
              {MOTION_LABELS[m]}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel number="04">Non-negotiable detail</FieldLabel>
        <p className="text-xs text-inkMuted mb-2 font-body">
          The one thing that ruins this clip if it&apos;s missing or wrong.
        </p>
        <TextField
          value={spec.nonNegotiable}
          onChange={(v) => set("nonNegotiable", v)}
          placeholder="e.g. the latte art must form a heart shape"
        />
      </div>

      <div>
        <FieldLabel number="05" optional>
          Audio / dialogue
        </FieldLabel>
        <p className="text-xs text-inkMuted mb-2 font-body">
          Only some models render audio — this changes which model you should use.
        </p>
        <TextField
          value={spec.audio}
          onChange={(v) => set("audio", v)}
          placeholder="e.g. soft cafe ambience, barista says 'enjoy'"
        />
      </div>

      <div>
        <FieldLabel number="06" optional>
          Exclusions
        </FieldLabel>
        <TextField
          value={spec.exclusions}
          onChange={(v) => set("exclusions", v)}
          placeholder="comma-separated, e.g. text overlays, watermark"
        />
      </div>
    </div>
  );
}
