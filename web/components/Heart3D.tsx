'use client';
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

export type VesselKey = 'lad' | 'lcx' | 'rca';

function riskColor(p: number): string {
  // green -> amber -> red
  const c = new THREE.Color();
  if (p < 0.5) c.lerpColors(new THREE.Color('#10b981'), new THREE.Color('#f59e0b'), p * 2);
  else c.lerpColors(new THREE.Color('#f59e0b'), new THREE.Color('#ef4444'), (p - 0.5) * 2);
  return `#${c.getHexString()}`;
}

const TERRITORIES: { key: VesselKey; label: string; phiStart: number; phiLength: number }[] = [
  // phi measured around Y; +Z (front/anterior) is phi ~ PI/2 in three.js sphere coords
  { key: 'lad', label: 'LAD territory (anterior)', phiStart: Math.PI / 6, phiLength: (Math.PI * 2) / 3 },
  { key: 'lcx', label: 'LCX territory (lateral)', phiStart: Math.PI / 6 + (Math.PI * 2) / 3, phiLength: (Math.PI * 2) / 3 },
  { key: 'rca', label: 'RCA territory (inferior/right)', phiStart: Math.PI / 6 + (Math.PI * 4) / 3, phiLength: (Math.PI * 2) / 3 },
];

function taperApex(geo: THREE.BufferGeometry) {
  // pull lower vertices inward -> heart-like apex
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) {
      const k = 1 + (y / 1.6) * 0.45; // y in [-1.6, 0]
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function Territory({ t, risk, selected, onSelect }: {
  t: (typeof TERRITORIES)[number]; risk: number; selected: boolean; onSelect: (v: VesselKey) => void;
}) {
  const [hover, setHover] = useState(false);
  const geo = useMemo(() => taperApex(
    new THREE.SphereGeometry(1.6, 48, 32, t.phiStart, t.phiLength, Math.PI * 0.18, Math.PI * 0.72)
  ), [t]);
  return (
    <mesh geometry={geo}
      onClick={(e) => { e.stopPropagation(); onSelect(t.key); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}>
      <meshStandardMaterial color={riskColor(risk)} roughness={0.35} metalness={0.1}
        emissive={riskColor(risk)} emissiveIntensity={hover || selected ? 0.45 : 0.12} />
    </mesh>
  );
}

function GreatVessels() {
  const mat = <meshStandardMaterial color="#b91c1c" roughness={0.4} />;
  return (
    <group>
      {/* aortic arch */}
      <mesh position={[0.1, 1.75, 0]} rotation={[0, 0, Math.PI / 2.6]}>{mat}
        <torusGeometry args={[0.55, 0.22, 16, 32, Math.PI * 1.1]} />
      </mesh>
      {/* descending aorta stub */}
      <mesh position={[-0.42, 1.15, 0]}>{mat}<cylinderGeometry args={[0.2, 0.2, 0.9, 16]} /></mesh>
      {/* pulmonary trunk */}
      <mesh position={[0.55, 1.55, 0.35]} rotation={[0.3, 0, -0.5]}>{mat}
        <cylinderGeometry args={[0.18, 0.22, 1.0, 16]} />
      </mesh>
      {/* superior vena cava */}
      <mesh position={[-0.15, 2.0, -0.25]}>{mat}<cylinderGeometry args={[0.16, 0.16, 0.9, 16]} /></mesh>
      {/* pulmonary veins */}
      <mesh position={[0.75, 1.1, -0.5]} rotation={[0.9, 0, -0.6]}>{mat}
        <cylinderGeometry args={[0.11, 0.11, 0.7, 12]} />
      </mesh>
      <mesh position={[-0.85, 1.1, -0.5]} rotation={[0.9, 0, 0.6]}>{mat}
        <cylinderGeometry args={[0.11, 0.11, 0.7, 12]} />
      </mesh>
    </group>
  );
}

function Beating({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const s = 1 + 0.035 * Math.pow(Math.max(0, Math.sin(t * 4.2)), 3);
    g.current?.scale.set(s, s, s);
  });
  return <group ref={g}>{children}</group>;
}

export default function Heart3D({ risks, onSelect }: {
  risks: Record<VesselKey, number>; onSelect: (v: VesselKey) => void;
}) {
  const [sel, setSel] = useState<VesselKey | null>(null);
  return (
    <div className="h-96 w-full">
      <Canvas camera={{ position: [0, 0.8, 6.2], fov: 42 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.4} />
        <directionalLight position={[-4, 2, -3]} intensity={0.4} />
        <Beating>
          {TERRITORIES.map(t => (
            <Territory key={t.key} t={t} risk={risks[t.key]} selected={sel === t.key}
              onSelect={(v) => { setSel(v); onSelect(v); }} />
          ))}
          <GreatVessels />
        </Beating>
        <Html position={[0, -2.6, 0]} center className="!pointer-events-none">
          <div className="text-[11px] text-slate-400 whitespace-nowrap">Illustrative territory map — not patient imaging</div>
        </Html>
        <OrbitControls enablePan={false} minDistance={3.5} maxDistance={10} />
      </Canvas>
      <div className="flex justify-center gap-4 mt-1 text-xs text-slate-400">
        {TERRITORIES.map(t => (
          <button key={t.key} onClick={() => { setSel(t.key); onSelect(t.key); }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${sel === t.key ? 'bg-slate-800' : ''}`}>
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: riskColor(risks[t.key]) }} />
            {t.key.toUpperCase()} {Math.round(risks[t.key] * 100)}%
          </button>
        ))}
      </div>
    </div>
  );
}
