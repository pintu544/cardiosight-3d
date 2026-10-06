'use client';
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export type VesselKey = 'lad' | 'lcx' | 'rca';

// Anatomical mesh -> coronary territory mapping (HRA heart model, CC BY 4.0)
// LAD: anterior LV wall + septum | LCX: lateral wall + left atrium | RCA: right heart + inferior wall
const TERRITORY_MAP: Record<string, VesselKey | 'neutral'> = {
  VH_F_left_ventricle: 'lad',
  VH_F_interventricular_septum: 'lad',
  VH_F_papillary_muscle_of_heart_ant: 'lad',
  VH_F_papillary_muscle_of_heart_antlat: 'lad',
  VH_F_papillary_muscle_of_heart_med: 'lad',
  VH_F_papillary_muscle_of_heart_pos: 'lad',
  VH_F_papillary_muscle_of_heart_posmed: 'lad',
  VH_F_left_cardiac_atrium: 'lcx',
  VH_F_right_cardiac_atrium: 'rca',
  VH_F_right_ventricle: 'rca',
  VH_F_aortic_valve: 'neutral',
  VH_F_pulmonary_valve: 'neutral',
  VH_F_mitral_valve: 'neutral',
  VH_F_tricuspid_valve: 'neutral',
};

const TERRITORY_LABELS: Record<VesselKey, string> = {
  lad: 'LAD territory (anterior wall + septum)',
  lcx: 'LCX territory (lateral wall)',
  rca: 'RCA territory (right heart + inferior wall)',
};

function riskColor(p: number): THREE.Color {
  const c = new THREE.Color();
  if (p < 0.5) c.lerpColors(new THREE.Color('#10b981'), new THREE.Color('#f59e0b'), p * 2);
  else c.lerpColors(new THREE.Color('#f59e0b'), new THREE.Color('#ef4444'), (p - 0.5) * 2);
  return c;
}

function AnatomicalHeart({ risks, onSelect }: {
  risks: Record<VesselKey, number>;
  onSelect: (v: VesselKey) => void;
}) {
  const { scene } = useGLTF('/models/heart.glb');
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<VesselKey | null>(null);

  const meshes = useMemo(() => {
    const list: { name: string; geometry: THREE.BufferGeometry; territory: VesselKey | 'neutral' }[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const territory = TERRITORY_MAP[mesh.name] ?? 'neutral';
        list.push({ name: mesh.name, geometry: mesh.geometry, territory });
      }
    });
    return list;
  }, [scene]);

  const handleClick = (territory: VesselKey | 'neutral') => {
    if (territory === 'neutral') return;
    setSelected(territory);
    onSelect(territory);
  };

  return (
    <group>
      {meshes.map((m) => {
        const isNeutral = m.territory === 'neutral';
        const risk = isNeutral ? 0 : risks[m.territory as VesselKey];
        const base = isNeutral ? new THREE.Color('#94a3b8') : riskColor(risk);
        const active = hovered === m.name || (!isNeutral && selected === m.territory);
        return (
          <mesh
            key={m.name}
            geometry={m.geometry}
            onClick={(e) => { e.stopPropagation(); handleClick(m.territory); }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(m.name); document.body.style.cursor = isNeutral ? 'default' : 'pointer'; }}
            onPointerOut={() => { setHovered(null); document.body.style.cursor = 'default'; }}
          >
            <meshStandardMaterial
              color={base}
              roughness={0.45}
              metalness={0.05}
              emissive={base}
              emissiveIntensity={active ? 0.5 : 0.08}
              transparent={isNeutral}
              opacity={isNeutral ? 0.55 : 1}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Beating({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // ~72 bpm double-thump: lub-dub
    const beat = Math.pow(Math.max(0, Math.sin(t * 3.77)), 6)
      + 0.5 * Math.pow(Math.max(0, Math.sin(t * 3.77 - 0.9)), 6);
    const s = 1 + 0.03 * beat;
    g.current?.scale.set(s, s, s);
  });
  return <group ref={g}>{children}</group>;
}

function riskHex(p: number): string {
  return `#${riskColor(p).getHexString()}`;
}

export default function Heart3D({ risks, onSelect }: {
  risks: Record<VesselKey, number>; onSelect: (v: VesselKey) => void;
}) {
  const [sel, setSel] = useState<VesselKey | null>(null);
  const pick = (v: VesselKey) => { setSel(v); onSelect(v); };
  return (
    <div className="h-96 w-full">
      <Canvas camera={{ position: [0.35, 0.45, 0.55], fov: 40 }}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 6, 5]} intensity={1.6} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Beating>
          {/* HRA model is in meters — scale up and center on its bounding box */}
          <group scale={9} position={[-0.33, -4.0, 0.5]}>
            <AnatomicalHeart risks={risks} onSelect={pick} />
          </group>
        </Beating>
        <Html position={[0, -2.7, 0]} center className="!pointer-events-none">
          <div className="text-[11px] text-slate-400 whitespace-nowrap text-center">
            Anatomical heart (Human Atlas Project, CC BY 4.0) — territory overlay is illustrative, not patient imaging
          </div>
        </Html>
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={12} />
      </Canvas>
      <div className="flex justify-center gap-4 mt-1 text-xs text-slate-400">
        {(Object.keys(TERRITORY_LABELS) as VesselKey[]).map((k) => (
          <button key={k} onClick={() => pick(k)} title={TERRITORY_LABELS[k]}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${sel === k ? 'bg-slate-800' : ''}`}>
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: riskHex(risks[k]) }} />
            {k.toUpperCase()} {Math.round(risks[k] * 100)}%
          </button>
        ))}
      </div>
    </div>
  );
}

useGLTF.preload('/models/heart.glb');
