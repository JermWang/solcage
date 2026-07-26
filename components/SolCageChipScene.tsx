"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Stage = "blockout" | "structure" | "form" | "material" | "surface" | "lighting" | "interaction" | "final";

type Props = {
  className?: string;
  stage?: Stage;
  scrollReactive?: boolean;
};

const VIOLET = 0x8d65ff;
const LIME = 0xc9ff38;

function addLightning(group: THREE.Group, material: THREE.Material, xOffset: number, zOffset: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.12 + xOffset, 0.34 + zOffset);
  shape.bezierCurveTo(0.09 + xOffset, 0.27 + zOffset, 0.15 + xOffset, 0.12 + zOffset, 0.02 + xOffset, 0.02 + zOffset);
  shape.bezierCurveTo(-0.08 + xOffset, -0.06 + zOffset, -0.04 + xOffset, -0.18 + zOffset, 0.16 + xOffset, -0.34 + zOffset);
  shape.lineTo(0.04 + xOffset, -0.05 + zOffset);
  shape.bezierCurveTo(0.22 + xOffset, -0.18 + zOffset, 0.23 + xOffset, -0.32 + zOffset, 0.11 + xOffset, -0.42 + zOffset);
  shape.bezierCurveTo(-0.2 + xOffset, -0.22 + zOffset, -0.23 + xOffset, -0.02 + zOffset, -0.08 + xOffset, 0.1 + zOffset);
  shape.bezierCurveTo(0.01 + xOffset, 0.17 + zOffset, -0.02 + xOffset, 0.23 + zOffset, -0.12 + xOffset, 0.34 + zOffset);

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  geometry.center();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.205;
  group.add(mesh);
  return mesh;
}

function buildChip(stage: Stage) {
  const root = new THREE.Group();
  root.name = "solcage-chip-root";

  const black = new THREE.MeshPhysicalMaterial({
    color: stage === "blockout" ? 0x4b4b4b : 0x121214,
    roughness: stage === "blockout" ? 0.8 : 0.58,
    metalness: 0.06,
    clearcoat: stage === "material" || stage === "surface" || stage === "lighting" || stage === "interaction" || stage === "final" ? 0.12 : 0,
    clearcoatRoughness: 0.5,
  });
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xd9dbdd, roughness: 0.22, metalness: 0.95, clearcoat: 0.2 });
  const violet = new THREE.MeshPhysicalMaterial({ color: VIOLET, roughness: 0.18, metalness: 0.05, clearcoat: 0.9, emissive: 0x24104f, emissiveIntensity: 0.45 });
  const lime = new THREE.MeshPhysicalMaterial({ color: LIME, roughness: 0.16, metalness: 0.03, clearcoat: 0.9, emissive: 0x273600, emissiveIntensity: 0.55 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, stage === "blockout" ? 48 : 96, 2, false), black);
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = "body-shell";
  root.add(body);

  if (stage === "blockout") {
    root.userData.sculptRuntime = { pivots: { root }, colliders: [{ type: "cylinder", radius: 1, height: 0.3 }] };
    return root;
  }

  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.035, 96), black);
  top.position.y = 0.166;
  top.castShadow = true;
  top.name = "outer-face";
  root.add(top);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const inlay = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.06, 0.19, 2, 1, 2),
      index % 2 === 0 ? violet : lime,
    );
    inlay.position.set(Math.sin(angle) * 0.86, 0.16, Math.cos(angle) * 0.86);
    inlay.rotation.y = angle;
    inlay.castShadow = true;
    inlay.name = `edge-inlay-${index + 1}`;
    root.add(inlay);
  }

  if (stage === "structure") {
    root.userData.sculptRuntime = { pivots: { root }, colliders: [{ type: "cylinder", radius: 1, height: 0.3 }] };
    return root;
  }

  const annulus = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 12, 96), silver);
  annulus.rotation.x = Math.PI / 2;
  annulus.position.y = 0.205;
  annulus.castShadow = true;
  annulus.name = "metal-annulus";
  root.add(annulus);

  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.045, 96), black);
  medallion.position.y = 0.205;
  medallion.name = "center-medallion";
  root.add(medallion);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.14), silver);
    tick.position.set(Math.sin(angle) * 0.73, 0.207, Math.cos(angle) * 0.73);
    tick.rotation.y = angle;
    tick.name = `radial-tick-${index + 1}`;
    root.add(tick);
  }

  addLightning(root, violet, 0, 0.08);
  addLightning(root, lime, 0, -0.12);

  if (stage === "surface" || stage === "lighting" || stage === "interaction" || stage === "final") {
    for (let index = 0; index < 13; index += 1) {
      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(0.17 + index * 0.024, 0.003, 5, 64),
        new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.78, metalness: 0.06 }),
      );
      groove.rotation.x = Math.PI / 2;
      groove.position.y = 0.23;
      root.add(groove);
    }
  }

  const faceSocket = new THREE.Object3D();
  faceSocket.name = "face-socket";
  faceSocket.position.y = 0.23;
  root.add(faceSocket);
  root.userData.sculptRuntime = {
    pivots: { root },
    sockets: { face: faceSocket },
    colliders: [{ type: "cylinder", radius: 1, height: 0.3 }],
    destructionGroups: { "body-shell": [body], "face-trim": [annulus, medallion] },
  };
  return root;
}

export default function SolCageChipScene({ className = "", stage = "final", scrollReactive = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 2.4, 3.35);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = stage !== "blockout";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

    const chip = buildChip(stage);
    chip.rotation.set(0.18, -0.45, -0.08);
    chip.scale.setScalar(0.6);
    scene.add(chip);
    const ambient = new THREE.HemisphereLight(0xf4f0e8, 0x191424, stage === "blockout" ? 2.5 : 1.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff2de, stage === "blockout" ? 3 : 4.5);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    if (stage === "lighting" || stage === "interaction" || stage === "final") {
      const violetLight = new THREE.PointLight(VIOLET, 10, 9);
      violetLight.position.set(3, 1.4, 2);
      scene.add(violetLight);
      const limeLight = new THREE.PointLight(LIME, 8, 8);
      limeLight.position.set(-2.6, 0.5, -2);
      scene.add(limeLight);
    }
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.52, 72),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: stage === "blockout" ? 0.12 : 0.32 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    scene.add(floor);

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let scrollProgress = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onPointer = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 0.35;
      pointerY = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 0.2;
    };
    const onScroll = () => {
      scrollProgress = Math.min(1, window.scrollY / Math.max(window.innerHeight * 1.4, 1));
    };
    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    mount.addEventListener("pointermove", onPointer);
    window.addEventListener("resize", onResize);
    if (scrollReactive) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    onResize();

    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const targetY = reducedMotion ? -0.4 : -0.4 + elapsed * 0.14 + scrollProgress * 2.2 + pointerX;
      chip.rotation.y += (targetY - chip.rotation.y) * 0.045;
      chip.rotation.x += ((0.18 + scrollProgress * 0.45 - pointerY) - chip.rotation.x) * 0.05;
      chip.position.y = reducedMotion ? 0 : Math.sin(elapsed * 0.9) * 0.045 - scrollProgress * 0.12;
      chip.position.x = scrollReactive ? scrollProgress * 0.35 : 0;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      mount.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [scrollReactive, stage]);

  return <div ref={mountRef} className={`chip-scene ${className}`} role="img" aria-label="Animated SolCage casino chip" />;
}
