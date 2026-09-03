# Give AI What It Needs — launch posts

Voice: first-person founder. No em dashes. No AI-cliché words. Concrete details, contractions, opinions.

---

## X / Twitter post (you publish from @Matarisva)

Built a thing because I kept burning credits on the wrong shape of prompt.

You type "a quiet cafe at sunrise." Most prompt tools ask you if you want a cat or a dog. Mine reads the idea, pulls out Latte, Cafe, Scene, and asks only about those. One compiled prompt per platform. Midjourney, DALL.E, Higgsfield, Veo 3, Runway.

BYOK so it costs me nothing to run. Free tier works (NVIDIA, Google, Groq).

The bet: ask the 4 highest-leverage questions before you generate, not after you've already paid.

Web app + an MCP server so you can run it inside Claude.

give-ai-what-it-needs.vercel.app
github.com/Ashish-ReddyA/Give-AI-what-it-needs

#AIart #midjourney #promptengineering

---

## Reddit — r/midjourney (DRAFT for you to post, do not auto-post)

**Title:** I built a tool that asks you questions about your idea before it writes the Midjourney prompt. Trying to stop myself wasting credits on the wrong shape.

**Body:**

I waste a lot of credits regenerating because the first prompt was close but wrong. Wrong aspect ratio. Wrong style. Missing the one detail that actually mattered.

So I built a small web app. You type your idea. It pulls out the things in it (the subject, the key objects, the setting) and asks a few targeted questions about each. Then it writes one prompt per platform.

The part I care about: it stays grounded in what you actually typed. I had a bug where "a cafe at sunrise" produced "is it a cat or a dog?" and that was the moment I knew the prompt layer was broken. Fixed it. Now if you didn't mention an animal, it doesn't ask about one.

It's BYOK. Bring your own API key (NVIDIA and Google have free tiers, no card). Nothing leaves your browser on the Anthropic path. The key never touches my server on the other providers.

There's also an MCP server if you'd rather run it inside Claude Code or Claude Desktop.

Free, no signup, no email. Link and source below. If you try it, the thing I want to know is whether the questions it asks are the right ones or just friction.

give-ai-what-it-needs.vercel.app
github.com/Ashish-ReddyA/Give-AI-what-it-needs

---

## AI-video Discord (Higgsfield / Runway / Veo communities) (DRAFT for you to post)

**Title:** Spec Compiler — ask first, spend once (free, BYOK, MCP)

**Body:**

Video runs cost real credits and real minutes. I kept generating clips that were the right vibe but wrong length, wrong camera move, or missing the one detail that made the whole idea.

Built a tool that asks you a handful of questions before you generate:

- it reads your idea and extracts the things in it (subject, objects, setting)
- asks targeted questions about each, grounded in what you actually wrote
- writes one prompt per platform: Higgsfield, Veo 3, Runway
- routes audio to the models that actually render it
- duration drives the model pick because longer clips cost more

BYOK, free tier works (NVIDIA, Google, Groq). No signup. Also ships as an MCP server so you can run it in-chat inside Claude.

give-ai-what-it-needs.vercel.app
github.com/Ashish-ReddyA/Give-AI-what-it-needs

The honest question I'm trying to answer: does asking 4 questions upfront actually cut your regenerations, or does it just add friction? I built an outcome log into it to measure that. If you try it, tell me what it got wrong.

---

## Notes for you

- Replace give-ai-what-it-needs.vercel.app with the real URL once you deploy (Vercel root directory = spec-compiler-mvp, no env vars).
- Reddit and Discord posts stay drafts. You post them yourself. Those communities punish self-promo if an agent drops it in.
- X post is short on purpose. Your original posts underperform replies. Consider dropping the X post as a reply inside a bigger thread about credit waste or prompt tools, where it lands in front of an existing audience. That outperforms your standalone originals.
- npm publish: cd mcp-server, npm login, npm publish --access public. Then submit server.json to the MCP Registry and smithery.yaml to Smithery.
- Verify the npm name is free first: npm view spec-compiler-mcp (404 means available).
