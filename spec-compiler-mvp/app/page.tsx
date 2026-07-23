"use client";

import { useMemo, useState } from "react";
import { EMPTY_SPEC, ImageSpec } from "@/lib/types";
import { scoreSpec } from "@/lib/completeness";
import { compileAll } from "@/lib/compilers";
import QuestionFlow from "@/components/QuestionFlow";
import CompletenessMeter from "@/components/CompletenessMeter";
import ResultsPanel from "@/components/ResultsPanel";

export default function Home() {
  const [spec, setSpec] = useState<ImageSpec>(EMPTY_SPEC);

  const completeness = useMemo(() => scoreSpec(spec), [spec]);
  const results = useMemo(
    () => (completeness.isReadyToCompile ? compileAll(spec) : []),
    [spec, completeness.isReadyToCompile]
  );

  return (
    <main className="min-h-screen px-4 py-10 sm:py-16">
      <div className="max-w-xl mx-auto">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-inkMuted mb-1">
            Spec Compiler — MVP
          </p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink leading-tight">
            Ask first. Spend once.
          </h1>
          <p className="font-body text-sm text-inkMuted mt-2">
            Answer a few questions before you generate. Get one compiled
            prompt per platform — no wasted credits on the wrong shape,
            style, or missing detail.
          </p>
        </header>

        <section className="mb-6">
          <QuestionFlow spec={spec} onChange={setSpec} />
        </section>

        <section className="mb-6">
          <CompletenessMeter result={completeness} />
        </section>

        {results.length > 0 && (
          <section>
            <ResultsPanel results={results} />
          </section>
        )}

        <footer className="mt-12 pt-4 border-t border-line">
          <p className="font-mono text-[11px] text-inkMuted">
            Phase 1 MVP — image generation only. No graph engine, no LLM
            calls, no accounts yet. See README.md for the phase plan.
          </p>
        </footer>
      </div>
    </main>
  );
}
