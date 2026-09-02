import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const IS_PUBLIC_DEMO = window.location.hostname.endsWith('github.io') || new URLSearchParams(window.location.search).has('demo');
const DEMO_TOKEN = 'keystone-public-demo-token';
const AVATAR_MODEL_DB = 'keystone-avatar-rigs';
const AVATAR_MODEL_STORE = 'rigs';
const AVATAR_MODEL_RECORD = 'activeRig';
const AVATAR_ANIMATION_INDEX_KEY = 'keystoneAvatarRigAnimationIndex';
const AVATAR_THEME_KEY = 'keystoneAvatarTheme';

const avatarThemes = [
  { id: 'original', name: 'Original', colors: ['#5f9f28', '#b1ff57', '#d5ff41'], card: '#5f9f28', stage: '#9dce70', accent: '#b1ff57', outfit: '#d5ff41' },
  { id: 'cosmic-mind', name: 'Cosmic Mind', colors: ['#03020A', '#6D35D8', '#46DFFF'], card: '#08041A', stage: '#130B31', accent: '#8E5CFF', outfit: '#46DFFF' },
  { id: 'deep-space', name: 'Deep Space', colors: ['#101A35', '#32B8FF', '#8067FF'], card: '#101A35', stage: '#17274A', accent: '#32B8FF', outfit: '#8067FF' },
  { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#17151F', '#FF3CAC', '#00E5FF'], card: '#17151F', stage: '#321D3D', accent: '#00E5FF', outfit: '#FF3CAC' },
  { id: 'warm-tech', name: 'Warm Tech', colors: ['#29221D', '#C98235', '#F4B942'], card: '#29221D', stage: '#51351F', accent: '#F4B942', outfit: '#C98235' },
  { id: 'ocean-glass', name: 'Ocean Glass', colors: ['#063B4C', '#27D7C4', '#A7F3D0'], card: '#063B4C', stage: '#0A5965', accent: '#27D7C4', outfit: '#A7F3D0' },
  { id: 'royal-purple', name: 'Royal Purple', colors: ['#241332', '#7138B8', '#C8A2FF'], card: '#241332', stage: '#40205B', accent: '#C8A2FF', outfit: '#7138B8' },
  { id: 'clean-modern', name: 'Clean Modern', colors: ['#263238', '#90CAF9', '#B8E34B'], card: '#263238', stage: '#455A64', accent: '#B8E34B', outfit: '#90CAF9' },
  { id: 'sunset', name: 'Sunset', colors: ['#421C35', '#FF6B6B', '#FFAA5C'], card: '#421C35', stage: '#71334A', accent: '#FFAA5C', outfit: '#FF6B6B' },
  { id: 'forest-premium', name: 'Forest Premium', colors: ['#102A24', '#159A72', '#D5A928'], card: '#102A24', stage: '#1B4A3A', accent: '#D5A928', outfit: '#159A72' }
];
const popularGames = [
  { title: 'Neon Horizon', image: '/space_explorer.jpg' },
  { title: 'Starfall Circuit', image: '/epic_quest.jpg' },
  { title: 'Dungeon Relay', image: '/epic_quest.jpg' },
  { title: 'Skyline Drift', image: '/space_explorer.jpg' }
];
const MAX_AVATAR_ANIMATIONS = 5;

const demoUser: CurrentUser = {
  id: 'user1',
  username: 'Gamer123',
  email: 'gamer@example.com',
  role: 'developer'
};

const demoMarketplace: MarketplaceListing[] = [
  {
    keyId: 'demo-epic-quest',
    sellerId: 'randomUser1',
    salePrice: 12.99,
    game: {
      id: 'game1',
      title: 'Epic Quest',
      developer: 'DevStudio',
      price: 19.99,
      image: '/Keystone/epic_quest.jpg',
      genre: 'RPG'
    }
  },
  {
    keyId: 'demo-space-explorer',
    sellerId: 'randomUser2',
    salePrice: 7.49,
    game: {
      id: 'game2',
      title: 'Space Explorer',
      developer: 'Cosmic Games',
      price: 9.99,
      image: '/Keystone/space_explorer.jpg',
      genre: 'Sci-Fi'
    }
  },
  {
    keyId: 'demo-cyber-city',
    sellerId: 'randomUser3',
    salePrice: 18.5,
    game: {
      id: 'game3',
      title: 'Cyber City',
      developer: 'Neon Inc',
      price: 29.99,
      genre: 'Action'
    }
  }
];

const demoLibrary: LibraryItem[] = [
  {
    keyId: 'key-123',
    isListedForSale: false,
    game: demoMarketplace[0].game
  },
  {
    keyId: 'key-456',
    isListedForSale: false,
    game: demoMarketplace[1].game
  }
];

interface Game {
  id: string;
  title: string;
  developer: string;
  price: number;
  image?: string;
  genre?: string;
}

interface LibraryItem {
  keyId: string;
  game: Game;
  isListedForSale: boolean;
  salePrice?: number;
}

interface MarketplaceListing {
  keyId: string;
  game: Game;
  sellerId: string;
  salePrice: number;
}

interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'developer' | 'admin';
}

interface AvatarRig {
  fileName: string;
  blob: Blob;
}

interface StoredAvatarRig extends AvatarRig {
  id: string;
}

const openAvatarDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(AVATAR_MODEL_DB, 1);

  request.onupgradeneeded = () => {
    request.result.createObjectStore(AVATAR_MODEL_STORE);
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const loadStoredAvatarRig = async () => {
  if (!('indexedDB' in window)) return null;

  const db = await openAvatarDb();

  return new Promise<AvatarRig | null>((resolve, reject) => {
    const request = db
      .transaction(AVATAR_MODEL_STORE, 'readonly')
      .objectStore(AVATAR_MODEL_STORE)
      .get(AVATAR_MODEL_RECORD);

    request.onsuccess = () => {
      db.close();
      const result = request.result as StoredAvatarRig | undefined;
      resolve(result ? { fileName: result.fileName, blob: result.blob } : null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

const saveStoredAvatarRig = async (rig: AvatarRig) => {
  const db = await openAvatarDb();

  return new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(AVATAR_MODEL_STORE, 'readwrite')
      .objectStore(AVATAR_MODEL_STORE)
      .put({ ...rig, id: AVATAR_MODEL_RECORD }, AVATAR_MODEL_RECORD);

    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

function CosmicBrain3D({ onSelect }: { onSelect: (label: string) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.1, 7.2);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const brain = new THREE.Group();
    scene.add(brain);

    const nodeLabels = [
      { label: 'STORE', position: [.38, 1.02, .9], color: '#7152d9' },
      { label: 'LIBRARY', position: [.96, .5, .9], color: '#e6932d' },
      { label: 'DEVELOPER', position: [.92, -.42, .9], color: '#d54370' },
      { label: 'AVATAR', position: [0, -.92, .9], color: '#2fb4be' },
      { label: 'DEALS', position: [-.92, -.42, .9], color: '#9db63f' },
      { label: 'SETTINGS', position: [-.96, .5, .9], color: '#8359d4' }
    ];
    const makeNodeTexture = (label: string, color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.clearRect(0, 0, 512, 512);
      context.fillStyle = color;
      context.fillRect(0, 0, 512, 512);
      context.fillStyle = 'rgba(3, 9, 26, .18)';
      context.fillRect(18, 18, 476, 476);
      context.fillStyle = '#ffffff';
      const fontSize = label.length > 8 ? 52 : label.length > 6 ? 68 : 96;
      context.font = `800 ${fontSize}px Inter, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0, 0, 0, .75)';
      context.shadowBlur = 14;
      context.fillText(label, 256, 256);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const nodeMeshes: THREE.Mesh[] = [];
    nodeLabels.forEach(({ label, position, color }) => {
      const frontTexture = makeNodeTexture(label, color);
      const side = new THREE.MeshPhysicalMaterial({ color, roughness: .32, metalness: .12, clearcoat: .7 });
      const front = new THREE.MeshPhysicalMaterial({ color, map: frontTexture || undefined, roughness: .28, metalness: .08, clearcoat: .8 });
      const node = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, .2), [side, side, side, side, front, side]);
      node.position.set(position[0], position[1], position[2]);
      node.rotation.set(-.06, 0, position[0] * -.08);
      node.name = label;
      brain.add(node);
      nodeMeshes.push(node);
    });

    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cubePalette = [0xff4f78, 0xffa21f, 0x3a9cff, 0xd9ed6f, 0x30d6c7, 0xffd16a];
    const cubeMaterials = cubePalette.map((color) => new THREE.MeshPhysicalMaterial({
      color,
      roughness: .38,
      metalness: .08,
      clearcoat: .62,
      clearcoatRoughness: .22
    }));
    const seeded = (seed: number) => {
      const value = Math.sin(seed * 9283.17) * 43758.5453;
      return value - Math.floor(value);
    };
    const brainCubes: THREE.Mesh[] = [];
    [-.46, .46].forEach((centerX, hemisphereIndex) => {
      const cubeCount = 170;
      let cubeIndex = 0;
      let attempt = 0;
      while (cubeIndex < cubeCount && attempt < cubeCount * 8) {
        const seed = hemisphereIndex * 211 + attempt + 1;
        const localY = (seeded(seed + 2) * 2 - 1) * 1.02;
        // A brain silhouette is broad through the temples and gently narrows
        // at the crown and lower lobes instead of forming a round/heart blob.
        const heightT = (localY + 1.02) / 2.04;
        const lobeWidth = .72 + .28 * Math.sin(Math.PI * heightT);
        const localX = (seeded(seed) * 2 - 1) * .84 * lobeWidth;
        const localZ = (seeded(seed + 4) * 2 - 1) * (.84 + .08 * Math.sin(Math.PI * heightT));
        attempt += 1;
        if ((localX * localX) / ((.84 * lobeWidth) ** 2) + (localY * localY) / (1.02 * 1.02) + (localZ * localZ) / ((.84 + .08 * Math.sin(Math.PI * heightT)) ** 2) > 1) continue;
        const worldX = centerX + localX;
        if (Math.abs(worldX) < .1 && localY > -.65) continue;
        const size = .16 + seeded(seed + 3) * .055;
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterials[(cubeIndex + hemisphereIndex * 3) % cubeMaterials.length]);
        cube.position.set(
          worldX,
          .16 + localY,
          localZ
        );
        cube.scale.setScalar(size);
        cube.rotation.set(seeded(seed + 5) * .22, seeded(seed + 7) * .22, seeded(seed + 9) * .22);
        brain.add(cube);
        brainCubes.push(cube);
        cubeIndex += 1;
      }
    });

    for (let stemIndex = 0; stemIndex < 8; stemIndex += 1) {
      const row = Math.floor(stemIndex / 2);
      const column = stemIndex % 2;
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterials[(stemIndex + 2) % cubeMaterials.length]);
      cube.position.set((column - .5) * .16, -.84 - row * .13, .04);
      cube.scale.setScalar(.19);
      brain.add(cube);
      brainCubes.push(cube);
    }

    const connectionPairs: [THREE.Mesh, THREE.Mesh][] = [];
    brainCubes.forEach((cube, index) => {
      const nearest = brainCubes
        .filter((_, candidateIndex) => candidateIndex !== index)
        .map((candidate) => ({ candidate, distance: cube.position.distanceTo(candidate.position) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);
      nearest.forEach(({ candidate }) => {
        if (!connectionPairs.some(([from, to]) => (from === cube && to === candidate) || (from === candidate && to === cube))) connectionPairs.push([cube, candidate]);
      });
    });
    const connectionPositions = new Float32Array(connectionPairs.length * 6);
    connectionPairs.forEach(([from, to], index) => {
      connectionPositions.set([from.position.x, from.position.y, from.position.z, to.position.x, to.position.y, to.position.z], index * 6);
    });
    const connectionGeometry = new THREE.BufferGeometry();
    connectionGeometry.setAttribute('position', new THREE.BufferAttribute(connectionPositions, 3));
    brain.add(new THREE.LineSegments(connectionGeometry, new THREE.LineBasicMaterial({ color: 0xd7f8ff, transparent: true, opacity: .24 })));

    const starGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(270);
    for (let i = 0; i < positions.length; i += 3) {
      const radius = 2.1 + Math.random() * 1.2;
      const angle = Math.random() * Math.PI * 2;
      positions[i] = Math.cos(angle) * radius;
      positions[i + 1] = (Math.random() - .5) * 3.7;
      positions[i + 2] = Math.sin(angle) * radius * .5;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd8c4ff, size: .055, transparent: true, opacity: .8 }));
    scene.add(stars);

    scene.add(new THREE.HemisphereLight(0xd8f9ff, 0x00142d, 2.5));
    const rim = new THREE.PointLight(0x16bfff, 22, 15);
    rim.position.set(3, 2, 4);
    scene.add(rim);
    const key = new THREE.PointLight(0x39dfff, 20, 15);
    key.position.set(-3, 1, 4);
    scene.add(key);

    let frame = 0;
    let dragging = false;
    let dragX = 0;
    let dragY = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      dragX = event.clientX;
      dragY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (dragging && Math.abs(event.clientX - dragX) < 5 && Math.abs(event.clientY - dragY) < 5) {
        const bounds = renderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(nodeMeshes)[0];
        if (hit?.object.name) onSelectRef.current(hit.object.name);
      }
      dragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        brain.rotation.y += (event.clientX - dragX) * .008;
        brain.rotation.x = Math.max(-.72, Math.min(.72, brain.rotation.x + (event.clientY - dragY) * .006));
        dragX = event.clientX;
        dragY = event.clientY;
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);

    const resize = () => {
      const size = Math.max(1, Math.min(mount.clientWidth, mount.clientHeight));
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = (time: number) => {
      if (!dragging) brain.rotation.y += .0011;
      brain.position.y = Math.sin(time * .0012) * .09;
      stars.rotation.y = time * .00004;
      frame = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="cosmic-brain-canvas" aria-label="Interactive three-dimensional cosmic brain with destination cards" role="application" />;
}

function AvatarRigViewer({
  modelUrl,
  selectedClipIndex,
  onClipNames,
  onStatus
}: {
  modelUrl: string;
  selectedClipIndex: number;
  onClipNames: (clipNames: string[]) => void;
  onStatus: (status: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const selectedClipIndexRef = useRef(selectedClipIndex);

  const playAvatarClip = (clipIndex: number) => {
    const mixer = mixerRef.current;
    const clips = clipsRef.current;
    if (!mixer || clips.length === 0) return;

    const clip = clips[Math.min(clipIndex, clips.length - 1)];
    const nextAction = mixer.clipAction(clip);
    nextAction.reset().fadeIn(0.18).play();
    activeActionRef.current?.fadeOut(0.18);
    activeActionRef.current = nextAction;
  };

  useEffect(() => {
    selectedClipIndexRef.current = selectedClipIndex;
    playAvatarClip(selectedClipIndex);
  }, [selectedClipIndex]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameId = 0;
    const timer = new THREE.Timer();
    timer.connect(document);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.35, 5.6);
    camera.lookAt(0, 1.2, 0);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
    keyLight.position.set(2.8, 4.2, 3.5);
    scene.add(keyLight);
    scene.add(new THREE.HemisphereLight(0xf7ffe4, 0x31410f, 1.65));

    const groundShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 64),
      new THREE.MeshBasicMaterial({ color: 0x253125, transparent: true, opacity: 0.28, depthWrite: false })
    );
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.scale.set(1.35, 0.5, 1);
    groundShadow.position.y = -0.015;
    scene.add(groundShadow);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    onStatus('Loading rig...');
    onClipNames([]);

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (disposed) return;

        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const viewerHeightScale = Math.min(1, 420 / Math.max(mount.clientHeight, 1));
        model.scale.setScalar((2.45 * viewerHeightScale) / maxDimension);

        const fittedBox = new THREE.Box3().setFromObject(model);
        const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        model.position.set(-fittedCenter.x, -fittedBox.min.y, -fittedCenter.z);
        scene.add(model);

        const clips = gltf.animations.slice(0, MAX_AVATAR_ANIMATIONS);
        clipsRef.current = clips;
        onClipNames(clips.map((clip, index) => clip.name || `Animation ${index + 1}`));

        if (clips.length > 0) {
          mixerRef.current = new THREE.AnimationMixer(model);
          playAvatarClip(selectedClipIndexRef.current);
          onStatus(`${clips.length} animation${clips.length === 1 ? '' : 's'} ready`);
        } else {
          onStatus('No rig animations found');
        }
      },
      undefined,
      () => {
        if (!disposed) onStatus('Could not load this rig');
      }
    );

    const animate = (timestamp?: number) => {
      timer.update(timestamp);
      mixerRef.current?.update(timer.getDelta());
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mixerRef.current?.stopAllAction();
      timer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl, onClipNames, onStatus]);

  return <div className="avatar-rig-viewer" ref={mountRef} />;
}

function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'marketplace' | 'developer'>('marketplace');
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [, setMarketplace] = useState<MarketplaceListing[]>([]);
  const [activeDashboardCard, setActiveDashboardCard] = useState(0);
  const [cosmicZoom, setCosmicZoom] = useState(1);
  const [avatarRig, setAvatarRig] = useState<AvatarRig | null>(null);
  const [avatarRigUrl, setAvatarRigUrl] = useState('');
  const [avatarClipNames, setAvatarClipNames] = useState<string[]>([]);
  const [avatarRigStatus, setAvatarRigStatus] = useState('Upload a rigged .glb avatar');
  const [avatarAnimationIndex, setAvatarAnimationIndex] = useState(() => {
    const savedIndex = Number(localStorage.getItem(AVATAR_ANIMATION_INDEX_KEY));
    return Number.isInteger(savedIndex) && savedIndex >= 0 ? savedIndex : 0;
  });
  const [avatarTheme, setAvatarTheme] = useState(() => localStorage.getItem(AVATAR_THEME_KEY) || 'original');
  const [storeOpen, setStoreOpen] = useState(false);
  const [popularGameIndex, setPopularGameIndex] = useState(0);
  const [popularVideoUrl, setPopularVideoUrl] = useState<string | null>(null);
  const selectedAvatarTheme = avatarThemes.find((theme) => theme.id === avatarTheme) || avatarThemes[0];
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: LibraryItem | null } | null>(null);
  const [sellModal, setSellModal] = useState<LibraryItem | null>(null);
  const [sellPrice, setSellPrice] = useState<string>('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [token, setToken] = useState(() => IS_PUBLIC_DEMO ? DEMO_TOKEN : (localStorage.getItem('authToken') || ''));
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => IS_PUBLIC_DEMO ? demoUser : null);
  const [authError, setAuthError] = useState('');

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      setToken('');
      setCurrentUser(null);
    }

    return response;
  };

  useEffect(() => {
    if (!token) return;

    if (IS_PUBLIC_DEMO && token === DEMO_TOKEN) {
      setCurrentUser(demoUser);
      setMarketplace(demoMarketplace);
      return;
    }

    apiFetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired');
        const data = await response.json();
        setCurrentUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        setToken('');
        setCurrentUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!currentUser) return;

    if (activeTab === 'library') {
      fetchLibrary();
    } else if (activeTab === 'marketplace') {
      fetchMarketplace();
    }
  }, [activeTab, currentUser]);

  const fetchLibrary = async () => {
    if (IS_PUBLIC_DEMO) {
      setLibrary(demoLibrary);
      return;
    }

    try {
      const response = await apiFetch('/api/library/me');
      const data = await response.json();
      setLibrary(data);
    } catch (error) {
      console.error('Failed to fetch library', error);
    }
  };

  const fetchMarketplace = async () => {
    if (IS_PUBLIC_DEMO) {
      setMarketplace(demoMarketplace);
      return;
    }

    try {
      const response = await apiFetch('/api/marketplace');
      const data = await response.json();
      setMarketplace(data);
    } catch (error) {
      console.error('Failed to fetch marketplace', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, item: LibraryItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleSellClick = () => {
    if (contextMenu?.item) {
      setSellModal(contextMenu.item);
    }
    closeContextMenu();
  };

  const handleExportClick = () => {
    if (contextMenu?.item) {
      alert(`Exporting ${contextMenu.item.game.title} to ISO format for disk burning... \n\n(Simulated: creating DRM-free bundle)`);
    }
    closeContextMenu();
  };

  const submitSell = async () => {
    if (!sellModal || !sellPrice) return;

    if (IS_PUBLIC_DEMO) {
      alert('Demo mode: this would list your game on the live marketplace once the backend is hosted.');
      setSellModal(null);
      setSellPrice('');
      return;
    }

    try {
      const response = await apiFetch('/api/marketplace/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: sellModal.keyId,
          price: parseFloat(sellPrice)
        })
      });

      if (response.ok) {
        alert('Game listed on marketplace successfully!');
        setSellModal(null);
        setSellPrice('');
        fetchLibrary(); // Refresh library
      }
    } catch (error) {
      console.error('Failed to list game', error);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    const formData = new FormData(e.currentTarget);
    const body = authMode === 'register'
      ? {
          username: formData.get('username'),
          email: formData.get('email'),
          password: formData.get('password')
        }
      : {
          identifier: formData.get('email'),
          password: formData.get('password')
        };

    if (IS_PUBLIC_DEMO) {
      localStorage.setItem('authToken', DEMO_TOKEN);
      setToken(DEMO_TOKEN);
      setCurrentUser(demoUser);
      setMarketplace(demoMarketplace);
      setActiveTab('marketplace');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      localStorage.setItem('authToken', data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setActiveTab('marketplace');
    } catch {
      setAuthError('Could not reach KeyStone backend');
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setToken('');
    setCurrentUser(null);
    setLibrary([]);
    setMarketplace([]);
  };

  const enterPublicDemo = () => {
    localStorage.setItem('authToken', DEMO_TOKEN);
    setToken(DEMO_TOKEN);
    setCurrentUser(demoUser);
    setMarketplace(demoMarketplace);
    setActiveTab('marketplace');
  };

  useEffect(() => {
    let isMounted = true;

    loadStoredAvatarRig()
      .then((storedRig) => {
        if (!isMounted || !storedRig) return;
        setAvatarRig(storedRig);
        setAvatarRigStatus('Loading saved rig...');
      })
      .catch(() => {
        if (isMounted) setAvatarRigStatus('Upload a rigged .glb avatar');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!avatarRig) {
      setAvatarRigUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(avatarRig.blob);
    setAvatarRigUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarRig]);

  useEffect(() => {
    if (avatarClipNames.length === 0) return;

    if (avatarAnimationIndex >= avatarClipNames.length) {
      setAvatarAnimationIndex(0);
      localStorage.setItem(AVATAR_ANIMATION_INDEX_KEY, '0');
    }
  }, [avatarAnimationIndex, avatarClipNames.length]);

  const openAvatarUpload = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const isRigFile = /\.(glb|gltf)$/i.test(file.name);
    if (!isRigFile) {
      alert('Upload a .glb or .gltf file with the character rig and animations inside.');
      input.value = '';
      return;
    }

    try {
      const rig = { fileName: file.name, blob: file };
      await saveStoredAvatarRig(rig);
      setAvatarRig(rig);
      setAvatarClipNames([]);
      setAvatarAnimationIndex(0);
      setAvatarRigStatus('Reading rig animations...');
      localStorage.setItem(AVATAR_ANIMATION_INDEX_KEY, '0');
    } catch {
      alert('Could not save that avatar rig in this browser.');
    } finally {
      input.value = '';
    }
  };

  const selectAvatarAnimation = (animationIndex: number) => {
    setAvatarAnimationIndex(animationIndex);
    localStorage.setItem(AVATAR_ANIMATION_INDEX_KEY, String(animationIndex));
  };

  const selectAvatarTheme = (themeId: string) => {
    setAvatarTheme(themeId);
    localStorage.setItem(AVATAR_THEME_KEY, themeId);
  };

  const openStore = () => setStoreOpen(true);

  useEffect(() => {
    const timer = window.setInterval(() => setPopularGameIndex((index) => (index + 1) % popularGames.length), 3200);
    return () => window.clearInterval(timer);
  }, []);

  const renderPopularCardContent = () => (
    <span className="popular-card-content">
      <small>MOST POPULAR</small>
      {popularVideoUrl ? <video src={popularVideoUrl} autoPlay muted loop playsInline /> : <img src={popularGames[popularGameIndex].image} alt="" />}
      <b>{popularGames[popularGameIndex].title}</b>
    </span>
  );

  const renderAvatarThemePicker = () => (
    <div className="avatar-theme-picker" aria-label="Avatar card themes" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <span className="avatar-theme-label">Card theme</span>
      <div className="avatar-theme-row">
        {avatarThemes.map((theme) => (
          <button
            type="button"
            key={theme.id}
            title={theme.name}
            aria-label={`Use ${theme.name} theme`}
            className={theme.id === avatarTheme ? 'active' : ''}
            onClick={(event) => {
              event.stopPropagation();
              selectAvatarTheme(theme.id);
            }}
          >
            {theme.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
          </button>
        ))}
      </div>
    </div>
  );

  const renderAvatarControls = () => (
    <div className="avatar-card-controls" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button type="button" className="avatar-upload-button" onClick={openAvatarUpload}>
        Upload Rig
      </button>
      <span className="avatar-rig-status">{avatarRig?.fileName || avatarRigStatus}</span>
      {avatarClipNames.length > 0 ? (
        <div className="avatar-animation-row" aria-label="Avatar rig animations">
          {avatarClipNames.slice(0, MAX_AVATAR_ANIMATIONS).map((animationName, animationIndex) => (
            <button
              type="button"
              className={animationIndex === avatarAnimationIndex ? 'active' : ''}
              key={`${animationName}-${animationIndex}`}
              onClick={() => selectAvatarAnimation(animationIndex)}
            >
              {animationName}
            </button>
          ))}
        </div>
      ) : (
        <span className="avatar-rig-status muted">{avatarRigStatus}</span>
      )}
    </div>
  );

  const dashboardCards = [
    {
      label: 'Store',
      icon: 'controller',
      action: openStore
    },
    {
      label: 'Library',
      icon: 'disc',
      action: () => setActiveTab('library')
    },
    {
      label: 'Developer',
      icon: 'upload-dot',
      action: () => setActiveTab('developer')
    },
    {
      label: 'Avatar',
      icon: 'avatar-dot',
      action: openAvatarUpload
    },
    {
      label: 'Deals',
      icon: 'deal-dot',
      action: () => alert('Deals refresh daily in the Store.')
    },
    {
      label: 'Settings',
      icon: 'settings-dot',
      action: () => undefined
    }
  ];

  const publicDashboardCards = [
    {
      label: 'Store',
      icon: 'controller',
      action: enterPublicDemo
    },
    {
      label: 'Create Profile',
      icon: 'upload-dot',
      action: () => setAuthMode('register')
    },
    {
      label: 'Avatar',
      icon: 'avatar-dot',
      action: openAvatarUpload
    },
    {
      label: 'Deals',
      icon: 'deal-dot',
      action: () => alert('Deals refresh daily in the Store.')
    },
    {
      label: 'Settings',
      icon: 'settings-dot',
      action: () => undefined
    }
  ];

  const handleCosmicNodeSelect = (label: string) => {
    const cards = currentUser ? dashboardCards : publicDashboardCards;
    const card = cards.find((candidate) => candidate.label.toUpperCase() === label);
    if (card) card.action();
  };

  const handleDashboardCardClick = (card: { label: string; action: () => void }, index: number) => {
    if (selectedAvatarTheme.id === 'cosmic-mind') {
      if (card.label === 'Settings') setActiveDashboardCard(index);
      else card.action();
      return;
    }
    index === activeDashboardCard ? card.action() : setActiveDashboardCard(index);
  };

  const dashboardCardCount = currentUser ? dashboardCards.length : publicDashboardCards.length;

  useEffect(() => {
    const handleDashboardKeys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setActiveDashboardCard((current) => (current - 1 + dashboardCardCount) % dashboardCardCount);
      } else if (event.key === 'ArrowRight') {
        setActiveDashboardCard((current) => (current + 1) % dashboardCardCount);
      } else {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', handleDashboardKeys);
    return () => window.removeEventListener('keydown', handleDashboardKeys);
  }, [dashboardCardCount]);

  const dashboardAvatar = (
      <div
        className={`avatar-card dashboard-avatar-card ${avatarRigUrl ? 'has-rig' : ''}`}
        data-theme={selectedAvatarTheme.id}
        style={{
          '--avatar-card-color': selectedAvatarTheme.card,
          '--avatar-stage-color': selectedAvatarTheme.stage,
          '--avatar-accent': selectedAvatarTheme.accent,
          '--avatar-outfit': selectedAvatarTheme.outfit
        } as React.CSSProperties}
      >
      <div className="avatar-stage">
        <div className="avatar-shadow"></div>
        <div className="avatar-actor">
          {avatarRigUrl ? (
            <AvatarRigViewer
              modelUrl={avatarRigUrl}
              selectedClipIndex={avatarAnimationIndex}
              onClipNames={setAvatarClipNames}
              onStatus={setAvatarRigStatus}
            />
          ) : (
            <div className="avatar-body">
              <div className="avatar-head">
                <span className="avatar-hair"></span>
                <span className="avatar-eye left"></span>
                <span className="avatar-eye right"></span>
                <span className="avatar-smile"></span>
              </div>
              <div className="avatar-torso">
                <span className="avatar-jacket"></span>
              </div>
              <div className="avatar-legs"></div>
            </div>
          )}
        </div>
      </div>
      <div className="avatar-profile">
        <div>
          <span className="profile-label">Player Preview</span>
          <strong>{currentUser?.username || (authMode === 'register' ? 'Create your avatar' : 'Welcome back')}</strong>
        </div>
        <span className="profile-price">1280G</span>
      </div>
    </div>
  );

  const adjustCosmicZoom = (amount: number) => {
    setCosmicZoom((current) => Math.min(1.65, Math.max(.72, Number((current + amount).toFixed(2)))));
  };

  const cosmicZoomControls = (
    <div className="cosmic-zoom-controls" aria-label="Cosmic theme zoom controls">
      <button type="button" onClick={() => adjustCosmicZoom(-.12)} aria-label="Zoom out">−</button>
      <span>{Math.round(cosmicZoom * 100)}%</span>
      <button type="button" onClick={() => adjustCosmicZoom(.12)} aria-label="Zoom in">+</button>
    </div>
  );

  if (!token || !currentUser) {
    return (
      <div className={`app-container ${selectedAvatarTheme.id === 'cosmic-mind' && dashboardCards[activeDashboardCard]?.label === 'Settings' ? 'settings-panel-open' : ''}`} data-theme={selectedAvatarTheme.id} style={{ '--page-theme': selectedAvatarTheme.card, '--page-accent': selectedAvatarTheme.accent } as React.CSSProperties}>
        <input ref={avatarInputRef} className="avatar-file-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={handleAvatarUpload} />
        <div className="xbox-shell public-xbox-shell public-nxe-shell">
          <main className="blade-dashboard nxe-dashboard">
            <aside className="blade-rail left-blades" aria-label="Left blades">
              <span>marketplace</span>
              <span className="active">store</span>
              <span>library</span>
            </aside>
            <section className="blade-stage">
              <div className="blade-titlebar nxe-titlebar">
                <span>Sign In</span>
                <strong>KeyStone LIVE</strong>
              </div>
              <section
                className="nxe-scene public-nxe-scene"
                style={{ '--cosmic-zoom': cosmicZoom } as React.CSSProperties}
                onWheel={(event) => selectedAvatarTheme.id === 'cosmic-mind' && adjustCosmicZoom(event.deltaY < 0 ? .08 : -.08)}
              >
                {cosmicZoomControls}
                <svg className="neural-network-lines" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
                  <defs><filter id="neuralGlowPublic"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                  {[[500,78],[805,205],[790,505],[500,622],[210,505],[195,205]].map(([x,y], index) => (
                    <g key={`${x}-${y}`}>
                      <path d={`M 500 350 Q ${500 + (x - 500) * .42} ${350 + (y - 350) * .18} ${x} ${y}`} />
                      <circle cx={x} cy={y} r="5" style={{ '--pulse-delay': `${index * -.45}s` } as React.CSSProperties} />
                    </g>
                  ))}
                </svg>
                <div className="cosmic-brain-core" aria-hidden="true">
                  <span className="brain-orbit orbit-one"></span>
                  <span className="brain-orbit orbit-two"></span>
                  <CosmicBrain3D onSelect={handleCosmicNodeSelect} />
                  <span className="brain-core-label">THE EVERYTHING</span>
                </div>
                <div className="nxe-profile-card public-signin-card">
                  <form className="nxe-signin-form" onSubmit={handleAuthSubmit}>
                    <strong>KeyStone Profile</strong>
                    <div className="auth-tabs">
                      <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
                      <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
                    </div>
                    {authMode === 'register' && (
                      <input name="username" placeholder="Username" required maxLength={32} />
                    )}
                    <input name="email" type={authMode === 'register' ? 'email' : 'text'} placeholder={authMode === 'register' ? 'Email' : 'Email or username'} required />
                    <input name="password" type="password" placeholder="Password" required minLength={12} autoComplete="current-password" />
                    {authError && <div className="auth-error">{authError}</div>}
                    <button type="submit" className="btn-primary">{authMode === 'login' ? 'Sign In' : 'Create Profile'}</button>
                  </form>
                </div>

                <div className="nxe-avatar-stand">
                  {dashboardAvatar}
                </div>

                <div className="nxe-card-stack" aria-label="Dashboard menu">
                  {publicDashboardCards.map((card, index) => {
                    const offset = (index - activeDashboardCard + publicDashboardCards.length) % publicDashboardCards.length;
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        className={`nxe-menu-card ${index === activeDashboardCard ? 'active' : ''} ${card.label === 'Store' && index === activeDashboardCard ? 'store-popular-card' : ''} ${card.label === 'Avatar' && index === activeDashboardCard ? 'avatar-controls-open' : ''}`}
                        style={{
                          '--card-offset': offset,
                          '--card-depth': offset,
                          '--orbit-index': index,
                          zIndex: 20 - offset,
                          ...(card.label === 'Settings' && index === activeDashboardCard ? {
                            background: selectedAvatarTheme.card,
                            borderColor: selectedAvatarTheme.accent,
                            color: '#ffffff'
                          } : {})
                        } as React.CSSProperties}
                        key={card.label}
                        onClick={() => handleDashboardCardClick(card, index)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          index === activeDashboardCard ? card.action() : setActiveDashboardCard(index);
                        }}
                      >
                        <span className={`nxe-controller ${card.icon === 'controller' ? '' : card.icon}`}></span>
                        <strong>{card.label === 'Store' && index === activeDashboardCard && selectedAvatarTheme.id !== 'cosmic-mind' ? renderPopularCardContent() : card.label}</strong>
                        {card.label === 'Avatar' && index === activeDashboardCard && renderAvatarControls()}
                        {card.label === 'Settings' && index === activeDashboardCard && renderAvatarThemePicker()}
                      </div>
                    );
                  })}
                </div>

              </section>
            </section>
            <aside className="blade-rail right-blades" aria-label="Right blades">
              <span>games</span>
              <span>avatars</span>
              <span>system</span>
            </aside>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${selectedAvatarTheme.id === 'cosmic-mind' && publicDashboardCards[activeDashboardCard]?.label === 'Settings' ? 'settings-panel-open' : ''}`} data-theme={selectedAvatarTheme.id} style={{ '--page-theme': selectedAvatarTheme.card, '--page-accent': selectedAvatarTheme.accent } as React.CSSProperties} onClick={closeContextMenu}>
      <input ref={avatarInputRef} className="avatar-file-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={handleAvatarUpload} />
      <div className="titlebar">
        <div className="titlebar-drag-region"></div>
        <div className="titlebar-controls">
          <button onClick={logout}>Logout</button>
        </div>
      </div>
      <div className={`content-area ${activeTab === 'marketplace' ? 'store-content-area' : ''}`}>
        {activeTab === 'library' && (
          <div className="library-view">
            <button className="btn-secondary back-to-store" onClick={() => setActiveTab('marketplace')}>Back to Store</button>
            <h1>My Library</h1>
            <p className="hint-text">💡 Tip: Right-click (or left-click) a game to see options like Sell or Export.</p>
            
            <div className="games-grid">
              {library.map((item) => (
                <div 
                  key={item.keyId} 
                  className="game-card"
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, item);
                  }}
                >
                  <div className="game-image-container">
                    {item.game.image ? (
                      <img src={item.game.image} alt={item.game.title} className="game-thumbnail" />
                    ) : (
                      <div className="image-placeholder">No Image</div>
                    )}
                  </div>
                  {item.isListedForSale && <div className="status-badge">LISTED (${item.salePrice})</div>}
                  <div className="game-info">
                    <div className="game-title">{item.game.title}</div>
                    <div className="game-dev" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.game.developer}</span>
                      {item.game.genre && <span style={{ background: 'rgba(102, 252, 241, 0.2)', color: '#66fcf1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{item.game.genre}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="marketplace-view">
            <div className="xbox-shell dashboard-store-shell">
              <main className="blade-dashboard nxe-dashboard">
                <aside className="blade-rail left-blades" aria-label="Left blades">
                  <span>marketplace</span>
                  <span className="active">store</span>
                  <span>library</span>
                </aside>
                <section className="blade-stage">
                  <div className="blade-titlebar nxe-titlebar">
                    <span>{currentUser.username}</span>
                    <strong>KeyStone LIVE</strong>
                  </div>
                  <section
                    className={`nxe-scene nxe-menu-only-scene ${storeOpen ? 'store-open' : ''}`}
                    style={{ '--cosmic-zoom': cosmicZoom } as React.CSSProperties}
                    onWheel={(event) => selectedAvatarTheme.id === 'cosmic-mind' && adjustCosmicZoom(event.deltaY < 0 ? .08 : -.08)}
                  >
                    {cosmicZoomControls}
                    <svg className="neural-network-lines" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
                      <defs><filter id="neuralGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                      {[[500,78],[805,205],[790,505],[500,622],[210,505],[195,205]].map(([x,y], index) => (
                        <g key={`${x}-${y}`}>
                          <path d={`M 500 350 Q ${500 + (x - 500) * .42} ${350 + (y - 350) * .18} ${x} ${y}`} />
                          <circle cx={x} cy={y} r="5" style={{ '--pulse-delay': `${index * -.45}s` } as React.CSSProperties} />
                        </g>
                      ))}
                    </svg>
                    <div className="cosmic-brain-core" aria-hidden="true">
                      <span className="brain-orbit orbit-one"></span>
                      <span className="brain-orbit orbit-two"></span>
                      <CosmicBrain3D onSelect={handleCosmicNodeSelect} />
                      <span className="brain-core-label">THE EVERYTHING</span>
                    </div>
                    <div className="nxe-avatar-stand">
                      {dashboardAvatar}
                    </div>

                    <div className="nxe-card-stack" aria-label="Dashboard menu">
                      {dashboardCards.map((card, index) => {
                        const offset = (index - activeDashboardCard + dashboardCards.length) % dashboardCards.length;
                        return (
                          <div
                            role="button"
                            tabIndex={0}
                            className={`nxe-menu-card ${index === activeDashboardCard ? 'active' : ''} ${card.label === 'Store' && index === activeDashboardCard ? 'store-popular-card' : ''} ${card.label === 'Avatar' && index === activeDashboardCard ? 'avatar-controls-open' : ''}`}
                            style={{
                              '--card-offset': offset,
                              '--card-depth': offset,
                              '--orbit-index': index,
                              zIndex: 20 - offset,
                              ...(card.label === 'Settings' && index === activeDashboardCard ? {
                                background: selectedAvatarTheme.card,
                                borderColor: selectedAvatarTheme.accent,
                                color: '#ffffff'
                              } : {})
                            } as React.CSSProperties}
                            key={card.label}
                            onClick={() => handleDashboardCardClick(card, index)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              index === activeDashboardCard ? card.action() : setActiveDashboardCard(index);
                            }}
                          >
                            <span className={`nxe-controller ${card.icon === 'controller' ? '' : card.icon}`}></span>
                            <strong>{card.label === 'Store' && index === activeDashboardCard && selectedAvatarTheme.id !== 'cosmic-mind' ? renderPopularCardContent() : card.label}</strong>
                            {card.label === 'Avatar' && index === activeDashboardCard && renderAvatarControls()}
                            {card.label === 'Settings' && index === activeDashboardCard && renderAvatarThemePicker()}
                          </div>
                        );
                      })}
                    </div>
                    {storeOpen && (
                      <section className="store-overlay" aria-label="KeyStone Store">
                        <div className="store-overlay-header">
                          <div><span className="store-kicker">KeyStone Store</span><h1>Find your next world.</h1></div>
                          <button type="button" onClick={() => setStoreOpen(false)}>Back</button>
                        </div>
                        <div className="store-featured"><span>Featured drop</span><strong>Neon Horizon</strong><small>Explore a glowing city beyond the grid.</small><button type="button">View game · $29.99</button></div>
                        <div className="store-rows"><div><span>New releases</span><b>4 titles this week</b></div><div><span>Most played</span><b>Community favorites</b></div><div><span>Deals</span><b>Up to 60% off</b></div></div>
                      </section>
                    )}

                  </section>
                </section>
                <aside className="blade-rail right-blades" aria-label="Right blades">
                  <span>games</span>
                  <span>avatars</span>
                  <span>system</span>
                </aside>
              </main>
            </div>
          </div>
        )}
        {activeTab === 'developer' && (
          <div className="developer-view">
            <button className="btn-secondary back-to-store" onClick={() => setActiveTab('marketplace')}>Back to Store</button>
            <h1>Developer Portal</h1>
            <p className="hint-text">Upload your game to KeyStone. Set your own price, and receive automatic royalties from every secondary market sale.</p>
            
            <div style={{ background: 'rgba(31, 40, 51, 0.7)', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(102, 252, 241, 0.2)', maxWidth: '600px' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = {
                  title: formData.get('title'),
                  developer: formData.get('developer'),
                  price: formData.get('price'),
                  genre: formData.get('genre')
                };
                try {
                  const res = await apiFetch('/api/developer/upload', {
                    method: 'POST',
                    body: JSON.stringify(data)
                  });
                  if (res.ok) {
                    alert('Game uploaded to catalog successfully!');
                    (e.target as HTMLFormElement).reset();
                  } else {
                    const error = await res.json().catch(() => ({ error: 'Upload failed' }));
                    alert(error.error || 'Upload failed');
                  }
                } catch (err) {
                  console.error(err);
                }
              }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Game Title</label>
                  <input name="title" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Studio Name</label>
                  <input name="developer" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Retail Price ($)</label>
                    <input name="price" type="number" step="0.01" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Genre</label>
                    <input name="genre" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                  </div>
                </div>
                <div style={{ marginBottom: '2rem', padding: '1rem', background: '#0b0c10', borderRadius: '8px', border: '1px dashed #66fcf1' }}>
                  <p style={{ color: '#66fcf1', margin: 0, textAlign: 'center' }}>Drag and drop game files (mocked)</p>
                </div>
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Most Popular Store Clip (10 seconds max)</label>
                  <input
                    name="storeClip"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      const video = document.createElement('video');
                      video.preload = 'metadata';
                      video.onloadedmetadata = () => {
                        URL.revokeObjectURL(url);
                        if (video.duration > 10) {
                          alert('Please choose a game clip that is 10 seconds or shorter.');
                          event.target.value = '';
                          return;
                        }
                        setPopularVideoUrl(URL.createObjectURL(file));
                      };
                      video.src = url;
                    }}
                    style={{ width: '100%', color: '#c5c6c7' }}
                  />
                  <small style={{ display: 'block', marginTop: '0.4rem', color: '#888' }}>MP4, WebM, or MOV. This clip previews on the rotating Most Popular card.</small>
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>Upload & Mint Keys</button>
              </form>
            </div>
          </div>
        )}
      </div>

      {contextMenu && contextMenu.item && (
        <div 
          className="context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="context-menu-item" onClick={() => { alert('Launching game...'); closeContextMenu(); }}>Play</div>
          <div className="context-menu-item" onClick={() => { alert('Installing game...'); closeContextMenu(); }}>Install</div>
          <div className="context-menu-divider"></div>
          {!contextMenu.item.isListedForSale && (
            <div className="context-menu-item" onClick={handleSellClick}>Sell on Marketplace</div>
          )}
          <div className="context-menu-item" onClick={handleExportClick}>Export to ISO (Disk)</div>
        </div>
      )}

      {sellModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Sell {sellModal.game.title}</h2>
            <p>List your key on the marketplace. True ownership means you control the price.</p>
            <input 
              type="number" 
              placeholder="Sale Price ($)" 
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
            />
            {sellPrice && !isNaN(parseFloat(sellPrice)) && (
              <div className="fee-breakdown" style={{ background: '#1e1e24', padding: '1rem', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0a0a0' }}>
                  <span>Developer Royalty (10%):</span>
                  <span>${(parseFloat(sellPrice) * 0.10).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0a0a0' }}>
                  <span>Platform Fee (5%):</span>
                  <span>${(parseFloat(sellPrice) * 0.05).toFixed(2)}</span>
                </div>
                <hr style={{ borderColor: '#333', margin: '0.5rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2ecc71', fontWeight: 'bold' }}>
                  <span>You Receive:</span>
                  <span>${(parseFloat(sellPrice) * 0.85).toFixed(2)}</span>
                </div>
              </div>
            )}
            <p style={{ fontSize: '0.8rem', color: '#a0a0a0', marginTop: '0' }}>* A portion of every resale goes directly to the original developers, supporting them even on the secondary market!</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setSellModal(null); setSellPrice(''); }}>Cancel</button>
              <button className="btn-primary" onClick={submitSell} disabled={!sellPrice || isNaN(parseFloat(sellPrice)) || parseFloat(sellPrice) <= 0}>Confirm Listing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
