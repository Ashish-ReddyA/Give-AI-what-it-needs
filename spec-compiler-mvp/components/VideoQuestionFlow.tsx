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
    <div className="space-y-5">
      <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Brief</p>
          <h2 className="mt-1 text-lg font-semibold text-textPrimary">What moment do you want to create?</h2>
          <p className="mt-1 text-sm text-textSecondary">
            Describe the subject, setting, action, and key moment. The question engine will build the production detail.
          </p>
        </div>
        <label htmlFor="video-idea" className="sr-only">Video idea</label>
        <textarea
          id="video-idea"
          value={spec.idea}
          onChange={(e) => set("idea", e.target.value)}
          placeholder="A woman walks through a misty forest, looks back, and tightens her grip on a gold coin..."
          rows={6}
          className="min-h-40 w-full resize-y rounded-xl border border-borderUi bg-surfaceSubtle px-4 py-3.5 text-base leading-7 text-textPrimary placeholder:text-textMuted focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
      </section>

      <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-textPrimary">Core settings</h2>
          <p className="mt-1 text-sm text-textSecondary">Control format, length, movement, and the detail that must be right.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel>Aspect ratio</FieldLabel>
            <div role="group" aria-label="Aspect ratio" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(FORMAT_LABELS) as AspectFormat[]).map((format) => (
                <ChoiceButton
                  key={format}
                  active={spec.format === format}
                  onClick={() => set("format", format)}
                >
                  {FORMAT_LABELS[format]}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Duration</FieldLabel>
            <div role="group" aria-label="Video duration" className="grid gap-2">
              {(Object.keys(DURATION_LABELS) as VideoDuration[]).map((duration) => (
                <ChoiceButton
                  key={duration}
                  active={spec.duration === duration}
                  onClick={() => set("duration", duration)}
                >
                  {DURATION_LABELS[duration]}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Camera behavior</FieldLabel>
            <div role="group" aria-label="Camera behavior" className="grid gap-2">
              {(Object.keys(MOTION_LABELS) as CameraMotion[]).map((motion) => (
                <ChoiceButton
                  key={motion}
                  active={spec.motion === motion}
                  onClick={() => set("motion", motion)}
                >
                  {MOTION_LABELS[motion]}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <FieldLabel htmlFor="video-non-negotiable">Must-have detail</FieldLabel>
            <p className="mb-2 text-sm text-textSecondary">
              The detail that would make the clip unusable if it were missing or wrong.
            </p>
            <TextField
              id="video-non-negotiable"
              label="Must-have video detail"
              value={spec.nonNegotiable}
              onChange={(value) => set("nonNegotiable", value)}
              placeholder="For example: the coin must catch a sharp glint as she turns"
            />
          </div>
        </div>

        <details className="mt-6 border-t border-borderUi pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-textPrimary">Advanced details</summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="video-audio" optional>Audio or dialogue</FieldLabel>
              <TextField
                id="video-audio"
                label="Video audio or dialogue"
                value={spec.audio}
                onChange={(value) => set("audio", value)}
                placeholder="Footsteps, wind in the trees, spoken line..."
              />
            </div>
            <div>
              <FieldLabel htmlFor="video-exclusions" optional>Exclude</FieldLabel>
              <TextField
                id="video-exclusions"
                label="Video exclusions"
                value={spec.exclusions}
                onChange={(value) => set("exclusions", value)}
                placeholder="Text overlays, camera shake, extra people..."
              />
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
