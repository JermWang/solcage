import fs from "node:fs";

const specPath = new URL("./chip-sculpt-spec.json", import.meta.url);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const rootTemplate = spec.componentTree[0];

const actionProfile = (role, colliderType = "cylinder") => ({
  ...structuredClone(rootTemplate.actionProfile),
  animationRole: role,
  pivot: { mode: "center", localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.95 },
  collider: { type: colliderType, offset: [0, 0, 0], scale: [1, 0.16, 1], isTrigger: false, notes: "Low-cost runtime proxy." },
  sockets: role === "root" ? [{ id: "face-socket", position: [0, 0.17, 0], rotation: [0, 0, 0] }] : [],
});

const component = ({ id, name, level, role, primitive, parent = "root", material, dimensions, position, localFeatures = [] }) => ({
  ...structuredClone(rootTemplate),
  id,
  name,
  level,
  role,
  importance: level === "macro" ? 1 : 0.85,
  confidence: 0.94,
  primitive,
  parent,
  attachment: parent ? {
    parentSocket: "face-socket",
    localStart: [0, 0, 0],
    localEnd: [0, dimensions.height / 2, 0],
    contactType: "surface-mounted",
    embedDepth: 0.01,
    overlap: 0.01,
    gapTolerance: 0.005,
  } : null,
  dimensions: { ...dimensions, units: "relative", confidence: 0.95 },
  transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
  geometryDescriptor: {
    topologyIntent: primitive === "cylinder" ? "radial 96-segment hard-surface body" : "radial procedural profile",
    edgeTreatment: { type: "chamfer", bevelRadius: 0.025, segments: 3 },
    deformationStack: [],
    uvStrategy: "cylindrical procedural coordinates",
    normalStrategy: "analytic normals with bevel-weighted highlights",
  },
  actionProfile: actionProfile(role),
  material,
  materialLayers: [material],
  localFeatures,
  surfaceDetail: {
    macroRoughness: 0.64,
    microRoughness: 0.08,
    bumpAmplitude: 0.012,
    normalPattern: "concentric machining and fine ceramic grain",
    displacementPattern: "raised inlays and center insert only",
    occlusionPattern: "annular seams and inset contacts",
    edgeWearPattern: "subtle radial handling polish",
    notes: "Relief remains readable under a grazing key light.",
  },
  evidenceRefs: ["full-object"],
  fidelityTier: "hero",
});

spec.suitability = "pass";
spec.scores = {
  object_isolation: 3,
  silhouette_readability: 3,
  depth_inference: 2,
  primitive_decomposition: 3,
  material_procedurality: 3,
  occlusion_risk: 2,
  interaction_fit: 3,
};
spec.preSpecAssessment.unknownsToResolveBeforeImplementation = [];
spec.assumptions = [
  "The hidden underside mirrors the visible face.",
  "The browser model is an intentional stylized approximation, not manufacturing geometry.",
];
spec.referenceCamera = {
  solved: true,
  fovDegrees: 32,
  aspect: 1,
  orientation: { yaw: -22, pitch: 58, roll: -2 },
  positionHint: [0, 2.5, 3.6],
  note: "Three-quarter orthographic-like product view matched by a narrow perspective camera.",
};
spec.silhouette = {
  boundingShape: "low, wide beveled cylinder",
  aspectRatios: [1, 0.16, 1],
  symmetry: "twelve-fold radial symmetry around Y",
  dominantCurves: ["outer circular rim", "silver annulus", "center medallion"],
  negativeSpaces: ["thin annular seams between rim, field, annulus, and medallion"],
  landmarks: ["alternating edge inlays", "metal tick ring", "two-tone center lightning insert"],
};
spec.viewEvidence[0].observations = [
  "Outer diameter dominates the square frame.",
  "Visible face is tilted enough to reveal a thick black ceramic side wall.",
  "Twelve alternating raised edge inlays and twelve slimmer inner metal ticks create the radial rhythm.",
  "A brushed silver annulus frames a recessed black medallion with concentric machining.",
];
spec.viewEvidence[0].confidence = 0.96;

spec.componentTree = [
  component({
    id: "root",
    name: "Chip spin rig",
    level: "macro",
    role: "root",
    primitive: "cylinder",
    parent: null,
    material: "ceramic-black",
    dimensions: { width: 2, height: 0.32, depth: 2 },
    position: [0, 0, 0],
    localFeatures: [{ id: "body-edge-chamfer", kind: "bevel", radius: 0.045 }],
  }),
  component({
    id: "outer-rim",
    name: "Beveled ceramic rim",
    level: "macro",
    role: "rim",
    primitive: "torus",
    material: "ceramic-black",
    dimensions: { width: 2.02, height: 0.26, depth: 2.02 },
    position: [0, 0.04, 0],
    localFeatures: [
      { id: "edge-inlays", kind: "radial-raised-panels", count: 12, height: 0.028 },
      { id: "edge-bevel", kind: "bevel", radius: 0.05, segments: 4 },
    ],
  }),
  component({
    id: "outer-field",
    name: "Outer face field",
    level: "meso",
    role: "face",
    primitive: "cylinder",
    material: "ceramic-black",
    dimensions: { width: 1.58, height: 0.08, depth: 1.58 },
    position: [0, 0.18, 0],
    localFeatures: [{ id: "radial-ticks", kind: "instanced-metal-ticks", count: 12 }],
  }),
  component({
    id: "metal-annulus",
    name: "Brushed silver annulus",
    level: "meso",
    role: "trim",
    primitive: "torus",
    material: "brushed-silver",
    dimensions: { width: 1.25, height: 0.05, depth: 1.25 },
    position: [0, 0.225, 0],
    localFeatures: [{ id: "annulus-groove", kind: "concentric-seam", depth: 0.012 }],
  }),
  component({
    id: "center-medallion",
    name: "Machined center medallion",
    level: "meso",
    role: "medallion",
    primitive: "cylinder",
    material: "ceramic-black",
    dimensions: { width: 1.05, height: 0.07, depth: 1.05 },
    position: [0, 0.24, 0],
    localFeatures: [
      { id: "concentric-grooves", kind: "radial-linework", count: 18, depth: 0.008 },
      { id: "lightning-insert", kind: "raised-extrusion", height: 0.035 },
    ],
  }),
  component({
    id: "lightning-insert",
    name: "Two-tone lightning insert",
    level: "meso",
    role: "hero-mark",
    primitive: "extrude",
    material: "violet-resin",
    dimensions: { width: 0.36, height: 0.06, depth: 0.72 },
    position: [0, 0.3, 0],
    localFeatures: [{ id: "lime-tip", kind: "material-split", ratio: 0.48 }],
  }),
];

const referencePbr = {
  version: "1",
  sourceImage: "artifacts/chip-model/solcage-chip-reference.png",
  extractor: "img2threejs extract_pbr_evidence.py",
  method: "reference-pixel-inference",
  verdict: "pass",
  hardLimit: "Single-image inference; not exact inverse rendering.",
  usable: true,
  confidence: 0.86,
  estimatedFidelity: 0.86,
  targetThreshold: 0.7,
  maps: Object.fromEntries(["albedo", "roughness", "height", "normal", "ao"].map((channel) => [
    channel,
    { path: `artifacts/chip-model/pbr/chip-reference_${channel}.png`, channel },
  ])),
};
const bands = [
  { id: "macro", frequency: 2, amplitude: 0.05, role: "broad ceramic value drift" },
  { id: "meso", frequency: 18, amplitude: 0.018, role: "machining grooves and handling polish" },
  { id: "micro", frequency: 72, amplitude: 0.006, role: "grazing-highlight breakup" },
];
const textureProjection = { mode: "cylindrical", repeat: [1, 1], anisotropy: 8, texelDensityIntent: "Stable radial scale across face and edge." };
const material = (id, name, color, roughness, metalness, qualityTier) => ({
  id,
  name,
  type: "physical",
  shaderModel: "MeshPhysicalMaterial",
  baseColor: color,
  color,
  qualityTier,
  albedo: { dominant: color, secondary: id === "ceramic-black" ? ["#151515", "#27262a"] : [color] },
  colorVariation: { palette: [color], pattern: "radial-locality", amplitude: 0.04, heightCorrelation: 0.15 },
  textureResolution: 1024,
  textureProjection,
  surfaceFrequencyBands: bands,
  roughness: { base: roughness, variation: 0.08, map: "independent-procedural-roughness-field" },
  metalness: { base: metalness, variation: 0.03 },
  normal: { pattern: "independent-machining-height-field", strength: 0.22, scale: 32, space: "tangent" },
  ambientOcclusion: { cavityStrength: 0.28, contactShadowBias: 0.3, notes: "Independent annular seam AO." },
  clearcoat: id.includes("resin") ? 0.82 : 0.08,
  localOverrides: [{ id: id === "brushed-silver" ? "annulus" : `${id}-edge-polish`, region: "visible grazing edges", roughness: Math.max(0.08, roughness - 0.12), evidenceRef: "full-object" }],
  wear: { edgeWear: 0.05, scratches: ["subtle radial handling lines"], chips: [] },
  dirt: { amount: 0.01, cavityBias: 0.08, color: "#090909" },
  ...(qualityTier === "utility" ? {} : { referencePbr }),
});
spec.materials = [
  material("ceramic-black", "Rough black ceramic", "#171719", 0.62, 0.05, "hero"),
  material("violet-resin", "Violet resin inlay", "#8d55ff", 0.19, 0.04, "utility"),
  material("lime-resin", "Acid lime resin inlay", "#c9ff38", 0.16, 0.03, "utility"),
  material("brushed-silver", "Brushed silver trim", "#c7c9c8", 0.24, 0.92, "utility"),
];
spec.repetitionSystems = [
  { id: "edge-inlays-system", componentRef: "outer-rim", primitive: "box", count: 12, distribution: "radial", radius: 0.9, alternatingMaterials: ["violet-resin", "lime-resin"], instanced: true },
  { id: "radial-ticks-system", componentRef: "outer-field", primitive: "box", count: 12, distribution: "radial", radius: 0.69, material: "brushed-silver", instanced: true },
  { id: "machining-grooves-system", componentRef: "center-medallion", primitive: "torus", count: 18, distribution: "concentric", radiusRange: [0.12, 0.48], material: "ceramic-black", instanced: false },
];
const links = {
  "edge-inlays": "outer-rim/edge-inlays",
  "rim-bevel": "outer-rim/edge-bevel",
  "metal-ring": "brushed-silver/annulus",
  "machining-lines": "center-medallion/concentric-grooves",
  "lightning-groove": "center-medallion/lightning-insert",
  "metal-ticks": "outer-field/radial-ticks",
};
for (const detail of spec.preSpecAssessment.detailInventory.details) detail.mapsTo.ref = links[detail.id];
spec.featureReviewTargets = [
  { id: "chip-proportion-system", name: "Low wide chip silhouette and beveled edge", tier: "critical", passIds: ["blockout", "form-refinement"], minimumScore: 0.8, mustPass: true, componentRefs: ["root", "outer-rim"], evidenceRefs: ["full-object"] },
  { id: "radial-inlay-system", name: "Alternating violet and lime raised edge inlays", tier: "critical", passIds: ["structural-pass", "material-pass"], minimumScore: 0.8, mustPass: true, componentRefs: ["outer-rim"], evidenceRefs: ["full-object"] },
  { id: "medallion-system", name: "Silver annulus, machined center, and raised lightning insert", tier: "critical", passIds: ["form-refinement", "surface-pass"], minimumScore: 0.8, mustPass: true, componentRefs: ["metal-annulus", "center-medallion", "lightning-insert"], evidenceRefs: ["full-object"] },
  { id: "ceramic-lookdev-system", name: "Ceramic, resin, and brushed-metal material separation", tier: "critical", passIds: ["material-pass", "lighting-pass"], minimumScore: 0.75, mustPass: true, componentRefs: ["root", "outer-rim", "metal-annulus"], evidenceRefs: ["full-object"] },
  { id: "spin-rig-system", name: "Stable spin, tilt, collider, and named runtime hierarchy", tier: "important", passIds: ["interaction-pass", "optimization-pass"], minimumScore: 0.7, mustPass: false, componentRefs: ["root"], evidenceRefs: ["full-object"] },
];
spec.qualityContract.featureGroups = [
  { id: "chip-silhouette", name: "Chip silhouette and thickness", required: true, qualityCriteria: ["Radius-to-thickness ratio remains 6.25:1 with a rounded outer edge."], evidenceRefs: ["full-object"], failureModes: ["reads as a flat disc or thick puck"] },
  { id: "radial-language", name: "Radial inlay and tick language", required: true, qualityCriteria: ["Twelve inlays and twelve inner ticks stay evenly distributed and raised above the black field."], evidenceRefs: ["full-object"], failureModes: ["incorrect count, spacing, or alternating palette"] },
  { id: "center-stack", name: "Center medallion stack", required: true, qualityCriteria: ["Silver annulus, recessed machining, and raised two-tone insert remain distinct in silhouette and material."], evidenceRefs: ["full-object"], failureModes: ["center reads as a flat texture"] },
  { id: "material-separation", name: "Material separation", required: true, qualityCriteria: ["Ceramic is rough, resin is clear-coated, and silver is metallic under neutral and grazing light."], evidenceRefs: ["full-object"], failureModes: ["all surfaces read as uniform plastic"] },
];
spec.lightingFromPhoto = [
  { type: "key light", direction: [-2, 4, 3], color: "#fff4e8", intensity: 4.2, shadowSoftness: 0.45, note: "Broad warm key from upper-left." },
  { type: "fill light", direction: [3, 2, 2], color: "#8d65ff", intensity: 1.4, note: "Violet side fill separates the black ceramic." },
  { type: "rim light", direction: [0, 1, -3], color: "#c9ff38", intensity: 2.2, note: "Acid-lime rim accent with ACES tone mapping, exposure 1.05, dark gradient background, and soft ground contact shadow." },
];
spec.performanceBudget = { ...spec.performanceBudget, targetTriangles: 18000, maxDrawCalls: 28, fpsTarget: 60, textureSize: 1024 };

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
