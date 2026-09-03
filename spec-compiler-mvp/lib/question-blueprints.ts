import { Domain } from "./types";
import { Entity } from "./questions";

export type QuestionDepth = "standard" | "deep";
export type EntityKind = "person" | "place" | "drink" | "object" | "scene";

export interface AspectBlueprint {
  id: string;
  description: string;
  question: (label: string, domain: Domain) => string;
  options: string[];
  multi: boolean;
}

const personStandard: AspectBlueprint[] = [
  {
    id: "hair",
    description: "hair style, length, texture, and color",
    question: (label) => `How should ${label}'s hair look?`,
    options: ["short and neat", "long and flowing", "tied back", "curly", "straight"],
    multi: true,
  },
  {
    id: "top_clothing",
    description: "upper-body clothing, including layer, cut, fabric, fit, and color",
    question: (label) => `What is ${label} wearing on the upper body?`,
    options: ["fitted shirt", "loose blouse", "light jacket", "knit sweater", "layered top"],
    multi: true,
  },
  {
    id: "bottom_clothing",
    description: "lower-body clothing, including garment, length, fabric, fit, and color",
    question: (label) => `What is ${label} wearing on the lower body?`,
    options: ["trousers", "long skirt", "short skirt", "shorts", "layered fabric"],
    multi: true,
  },
  {
    id: "footwear",
    description: "footwear and its visible condition",
    question: (label) => `What footwear does ${label} have?`,
    options: ["walking boots", "dress shoes", "sneakers", "sandals", "barefoot"],
    multi: false,
  },
  {
    id: "accessories",
    description: "visible accessories the person carries or wears",
    question: (label) => `Which accessories, if any, does ${label} have?`,
    options: ["shoulder bag", "jewelry", "glasses", "hat", "none"],
    multi: true,
  },
  {
    id: "pose_posture",
    description: "pose, posture, body orientation, and weight distribution",
    question: (label) => `What is ${label}'s exact pose and posture?`,
    options: ["upright", "leaning forward", "looking back", "relaxed stance", "tense posture"],
    multi: true,
  },
  {
    id: "expression_gaze",
    description: "facial expression, gaze direction, and emotional state",
    question: (label) => `What expression and gaze should ${label} have?`,
    options: ["calm and focused", "curious", "uneasy", "determined", "looking away"],
    multi: true,
  },
  {
    id: "action",
    description: "precise action, hand use, direction, and interaction with named objects",
    question: (label) => `What exactly is ${label} doing?`,
    options: ["walking steadily", "pausing", "turning back", "holding an object", "reaching forward"],
    multi: true,
  },
  {
    id: "appearance",
    description: "age range, build, and other visible physical traits",
    question: (label) => `What visible age range and build should ${label} have?`,
    options: ["young adult", "middle-aged", "slender", "athletic", "average build"],
    multi: true,
  },
];

const personDeepImage: AspectBlueprint[] = [
  {
    id: "clothing_detail",
    description: "fabric, seams, texture, fit, layering, and wear of every clothing item",
    question: (label) => `How should the fabric, fit, and layering of ${label}'s clothing look?`,
    options: ["soft flowing fabric", "structured tailoring", "weathered fabric", "subtle stitching", "layered materials"],
    multi: true,
  },
  {
    id: "facial_detail",
    description: "fine facial features, skin tone, eye detail, and micro-expression",
    question: (label) => `Which fine facial details should define ${label}?`,
    options: ["soft features", "defined jawline", "visible freckles", "tired eyes", "subtle tension"],
    multi: true,
  },
  {
    id: "silhouette",
    description: "silhouette, overlap, and separation from the background",
    question: (label) => `How should ${label}'s silhouette read against the background?`,
    options: ["clean separation", "partly shadowed", "rim-lit outline", "blended into the scene"],
    multi: false,
  },
];

const personDeepVideo: AspectBlueprint[] = [
  ...personDeepImage,
  {
    id: "motion_arc",
    description: "the action's starting state, progression, peak moment, and ending state",
    question: (label) => `How should ${label}'s motion unfold from start to finish?`,
    options: ["slow entry then pause", "steady continuous movement", "turn at the peak moment", "accelerate then stop"],
    multi: false,
  },
  {
    id: "clothing_motion",
    description: "how hair, fabric, accessories, and loose items react to movement and wind",
    question: (label) => `How should ${label}'s hair and clothing react to movement?`,
    options: ["subtle natural sway", "strong wind movement", "fabric trails behind", "almost no secondary motion"],
    multi: true,
  },
  {
    id: "gait_timing",
    description: "gait, speed, rhythm, foot placement, and timing",
    question: (label) => `What gait, speed, and rhythm should ${label}'s movement have?`,
    options: ["slow measured steps", "natural walking pace", "hesitant steps", "urgent stride"],
    multi: false,
  },
];

const placeStandard: AspectBlueprint[] = [
  {
    id: "environment_contents",
    description: "foreground, midground, background, and named or directly implied elements",
    question: (label) => `What should be visible in the ${label}, from foreground to background?`,
    options: [],
    multi: true,
  },
  {
    id: "lighting",
    description: "light source, direction, softness, intensity, and color temperature",
    question: (label) => `How should light behave in the ${label}?`,
    options: ["soft side light", "strong backlight", "diffused overhead light", "cool shadowed light", "warm low-angle light"],
    multi: true,
  },
  {
    id: "time_weather",
    description: "time of day, season, weather, and atmospheric visibility when relevant",
    question: (label) => `What time, season, and weather define the ${label}?`,
    options: ["clear dawn", "overcast day", "misty morning", "windy evening", "dark night"],
    multi: true,
  },
  {
    id: "palette_materials",
    description: "dominant colors, surface materials, and texture family",
    question: (label) => `Which colors and materials should define the ${label}?`,
    options: ["cool greens and stone", "warm wood and amber", "muted earth tones", "deep blue shadows"],
    multi: true,
  },
  {
    id: "depth_scale",
    description: "spatial depth, scale, density, and openness",
    question: (label) => `How deep, dense, or open should the ${label} feel?`,
    options: ["tight and enclosed", "layered depth", "wide and open", "dense and immersive"],
    multi: false,
  },
  {
    id: "atmosphere",
    description: "emotional atmosphere and level of activity",
    question: (label) => `What atmosphere should the ${label} create?`,
    options: ["calm", "mysterious", "melancholic", "tense", "lively"],
    multi: true,
  },
];

const placeDeepImage: AspectBlueprint[] = [
  {
    id: "depth_layers",
    description: "specific foreground framing, midground action, and background landmarks",
    question: (label) => `How should the foreground, midground, and background layers of the ${label} differ?`,
    options: [],
    multi: true,
  },
  {
    id: "surface_detail",
    description: "fine environmental texture, wear, moisture, dust, and material variation",
    question: (label) => `Which fine surface and weathering details should appear in the ${label}?`,
    options: ["wet surfaces", "aged textures", "drifting dust", "rough bark", "polished surfaces"],
    multi: true,
  },
];

const placeDeepVideo: AspectBlueprint[] = [
  ...placeDeepImage,
  {
    id: "ambient_motion",
    description: "background and environmental movement over time",
    question: (label) => `What ambient motion should make the ${label} feel alive?`,
    options: ["leaves moving", "mist drifting", "shadows shifting", "distant figures crossing", "dust floating"],
    multi: true,
  },
  {
    id: "camera_environment_relation",
    description: "how the camera enters, travels through, and reveals the space",
    question: (label) => `How should the camera reveal or move through the ${label}?`,
    options: ["slow push forward", "lateral tracking", "locked wide view", "reveal from behind foreground"],
    multi: false,
  },
];

const objectStandard: AspectBlueprint[] = [
  {
    id: "size_scale",
    description: "physical size and scale relative to a hand, person, or the scene",
    question: (label) => `How large should the ${label} be relative to the scene?`,
    options: ["small enough for one hand", "palm-sized", "life-sized", "oversized"],
    multi: false,
  },
  {
    id: "color_material",
    description: "color, material, and construction",
    question: (label) => `What color and material should the ${label} have?`,
    options: ["polished metal", "aged metal", "dark wood", "clear glass", "painted surface"],
    multi: true,
  },
  {
    id: "texture_finish",
    description: "surface texture and finish",
    question: (label) => `What texture and finish should the ${label} have?`,
    options: ["matte", "glossy", "scratched", "weathered", "highly reflective"],
    multi: true,
  },
  {
    id: "condition_state",
    description: "condition and current state",
    question: (label) => `What condition and state should the ${label} be in?`,
    options: ["new", "aged", "damaged", "open", "closed"],
    multi: true,
  },
  {
    id: "placement_orientation",
    description: "position, orientation, contact, and relation to the entity using it",
    question: (label) => `Where is the ${label}, and how is it oriented?`,
    options: ["held tightly", "resting flat", "tilted toward camera", "partly hidden", "suspended"],
    multi: true,
  },
];

const objectDeepImage: AspectBlueprint[] = [
  {
    id: "micro_detail",
    description: "engraving, seams, marks, wear patterns, nicks, and patina",
    question: (label) => `Which fine marks, engravings, or wear details should the ${label} show?`,
    options: ["fine engraving", "worn edges", "small scratches", "subtle patina", "clean unmarked surface"],
    multi: true,
  },
  {
    id: "light_response",
    description: "reflection, refraction, highlights, transparency, and shadow",
    question: (label) => `How should the ${label} catch or transmit the light?`,
    options: ["sharp glint", "soft reflection", "subtle rim light", "transparent refraction", "deep matte shadow"],
    multi: true,
  },
];

const objectDeepVideo: AspectBlueprint[] = [
  ...objectDeepImage,
  {
    id: "object_motion",
    description: "movement, rotation, impact, settling, and timing over the clip",
    question: (label) => `How should the ${label} move or react during the clip?`,
    options: ["stay fixed", "rotate slowly", "swing with movement", "fall and settle", "flash briefly"],
    multi: false,
  },
];

const drinkStandard: AspectBlueprint[] = [
  {
    id: "vessel",
    description: "vessel type, material, shape, and color",
    question: (label) => `What vessel contains the ${label}?`,
    options: ["ceramic cup", "clear glass", "metal mug", "paper cup", "no vessel"],
    multi: false,
  },
  {
    id: "liquid_appearance",
    description: "liquid color, opacity, layering, foam, and surface detail",
    question: (label) => `How should the ${label} itself look?`,
    options: ["dark and opaque", "light and creamy", "layered", "foamy surface", "clear"],
    multi: true,
  },
  {
    id: "drink_state",
    description: "still, poured, steaming, stirred, or splashing state",
    question: (label) => `What state should the ${label} be in?`,
    options: ["still", "being poured", "steaming", "being stirred", "splashing"],
    multi: false,
  },
  {
    id: "source",
    description: "source container and pour relation when applicable",
    question: (label) => `If the ${label} is moving or being poured, what is the source?`,
    options: ["steel pitcher", "glass carafe", "bottle", "kettle", "not being poured"],
    multi: false,
  },
];

const drinkDeepVideo: AspectBlueprint[] = [
  {
    id: "fluid_motion",
    description: "pour path, flow speed, splash behavior, settling, and foam movement",
    question: (label) => `How should the ${label}'s fluid motion unfold?`,
    options: ["slow continuous pour", "thin precise stream", "brief splash", "foam expands", "swirl then settle"],
    multi: true,
  },
  {
    id: "steam_condensation",
    description: "steam, condensation, droplets, and how they change over time",
    question: (label) => `How should steam or condensation behave around the ${label}?`,
    options: ["thin rising steam", "heavy drifting steam", "condensation beads", "no visible steam"],
    multi: false,
  },
];

const sceneStandardImage: AspectBlueprint[] = [
  {
    id: "mood",
    description: "overall mood and emotional tone",
    question: () => "What overall mood should the image create?",
    options: ["calm", "mysterious", "melancholic", "tense", "joyful"],
    multi: true,
  },
  {
    id: "scene_lighting",
    description: "lighting quality, direction, intensity, and color temperature",
    question: () => "What lighting should shape the whole scene?",
    options: ["soft diffused light", "dramatic side light", "cool moonlight", "warm sunrise light", "deep shadow"],
    multi: true,
  },
  {
    id: "scene_time_atmosphere",
    description: "time of day and atmospheric conditions",
    question: () => "What time and atmospheric conditions define the scene?",
    options: ["clear dawn", "misty morning", "overcast day", "windy evening", "shadowy night"],
    multi: true,
  },
  {
    id: "scene_palette",
    description: "dominant palette, contrast, and saturation",
    question: () => "What color palette and contrast should unify the frame?",
    options: ["cool desaturated tones", "warm earth tones", "high contrast", "muted natural colors", "deep blue shadows"],
    multi: true,
  },
];

const sceneStandardVideo: AspectBlueprint[] = [
  ...sceneStandardImage,
  {
    id: "moment_structure",
    description: "opening state, change, key moment, and final state of the clip",
    question: () => "How should the moment unfold from the opening frame to the final frame?",
    options: ["quiet setup then reveal", "continuous action", "slow build to one key moment", "action then still ending"],
    multi: false,
  },
  {
    id: "pacing",
    description: "pace, rhythm, pauses, and energy over time",
    question: () => "What pacing and rhythm should the clip have?",
    options: ["slow and meditative", "steady natural pace", "tense with a pause", "quick and energetic"],
    multi: false,
  },
];

const sceneDeepVideo: AspectBlueprint[] = [
  {
    id: "key_moment",
    description: "the single most important visual beat and when it happens",
    question: () => "What is the clip's single most important moment, and when should it happen?",
    options: [],
    multi: false,
  },
  {
    id: "camera_story",
    description: "camera position, movement, framing changes, and reveal logic",
    question: () => "How should the camera tell the story of the moment?",
    options: ["locked observer", "slow push toward subject", "track beside subject", "start wide then close in"],
    multi: false,
  },
  {
    id: "secondary_motion",
    description: "ambient and secondary motion that supports the main action",
    question: () => "Which secondary motion should make the scene feel alive?",
    options: ["fabric moving", "leaves swaying", "mist drifting", "shadows changing", "particles floating"],
    multi: true,
  },
  {
    id: "continuity",
    description: "continuity constraints that must remain stable throughout the clip",
    question: () => "What must remain visually consistent throughout the clip?",
    options: ["character identity", "clothing", "object position", "lighting direction", "background layout"],
    multi: true,
  },
];

export function inferEntityKind(entity: Entity): EntityKind {
  const label = entity.label.toLowerCase();
  if (label === "scene") return "scene";
  if (/(person|girl|boy|woman|man|child|kid|lady|guy|barista|chef|worker|dancer|traveler|runner|character|figure|portrait)/.test(label)) return "person";
  if (/(forest|cafe|room|street|beach|mountain|field|garden|kitchen|office|city|interior|alley|park|shop|bar|restaurant|library|landscape|building)/.test(label)) return "place";
  if (/(latte|coffee|tea|drink|juice|wine|beer|water|soup|sauce|milk|cocktail)/.test(label)) return "drink";
  return "object";
}

export function getAspectBlueprints(
  entity: Entity,
  domain: Domain,
  depth: QuestionDepth
): AspectBlueprint[] {
  const kind = inferEntityKind(entity);
  if (depth === "standard") {
    if (kind === "person") return personStandard;
    if (kind === "place") return placeStandard;
    if (kind === "drink") return drinkStandard;
    if (kind === "scene") return domain === "video" ? sceneStandardVideo : sceneStandardImage;
    return objectStandard;
  }
  if (kind === "person") return domain === "video" ? personDeepVideo : personDeepImage;
  if (kind === "place") return domain === "video" ? placeDeepVideo : placeDeepImage;
  if (kind === "drink") return domain === "video" ? drinkDeepVideo : objectDeepImage;
  if (kind === "scene") return domain === "video" ? sceneDeepVideo : objectDeepImage;
  return domain === "video" ? objectDeepVideo : objectDeepImage;
}

export function fallbackQuestion(
  blueprint: AspectBlueprint,
  entity: Entity,
  domain: Domain,
  idPrefix: string
) {
  return {
    id: `${idPrefix}${blueprint.id}`,
    aspectId: blueprint.id,
    question: blueprint.question(entity.label, domain),
    options: blueprint.options,
    multi: blueprint.multi,
  };
}
