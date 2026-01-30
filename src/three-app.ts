/**
 * Three.js Application - Replaces claygl application
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

export interface ThreeAppConfig {
  container: string | HTMLElement;
  devicePixelRatio?: number;
  autoRender?: boolean;
}

export class ThreeApp {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  public renderer: THREE.WebGLRenderer;
  public container: HTMLElement;
  public controls?: OrbitControls;
  public clock: THREE.Clock;

  private animationId?: number;
  private renderCallback?: () => void;

  constructor(config: ThreeAppConfig) {
    // Get container
    if (typeof config.container === "string") {
      this.container = document.querySelector(config.container) as HTMLElement;
    } else {
      this.container = config.container;
    }

    if (!this.container) {
      throw new Error("Container not found");
    }

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera (default perspective, can be changed)
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 170);
    this.camera.lookAt(0, 0, 0);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(config.devicePixelRatio || 1);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    // Clock for animations
    this.clock = new THREE.Clock();

    // Handle window resize
    window.addEventListener("resize", this.onWindowResize.bind(this));

    // Start render loop if autoRender
    if (config.autoRender !== false) {
      this.startRenderLoop();
    }
  }

  /**
   * Create a perspective camera
   */
  createPerspectiveCamera(position: number[], target: number[], fov: number = 45): THREE.PerspectiveCamera {
    const aspect = this.getAspect();
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
    this.camera = camera;
    return camera;
  }

  /**
   * Create an orthographic camera
   */
  createOrthographicCamera(position: number[], target: number[], size: number = 50): THREE.OrthographicCamera {
    const aspect = this.getAspect();
    const camera = new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, 0, 1000);
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
    this.camera = camera;
    return camera;
  }

  /**
   * Create orbit controls
   */
  createOrbitControls(
    options: {
      enableDamping?: boolean;
      dampingFactor?: number;
      enableZoom?: boolean;
      enablePan?: boolean;
      minDistance?: number;
      maxDistance?: number;
      minPolarAngle?: number;
      maxPolarAngle?: number;
    } = {}
  ): OrbitControls {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = options.enableDamping !== false;
    this.controls.dampingFactor = options.dampingFactor || 0.05;
    this.controls.enableZoom = options.enableZoom !== false;
    this.controls.enablePan = options.enablePan !== false;

    if (options.minDistance !== undefined) this.controls.minDistance = options.minDistance;
    if (options.maxDistance !== undefined) this.controls.maxDistance = options.maxDistance;
    if (options.minPolarAngle !== undefined) this.controls.minPolarAngle = options.minPolarAngle;
    if (options.maxPolarAngle !== undefined) this.controls.maxPolarAngle = options.maxPolarAngle;

    this.controls.addEventListener("change", () => {
      if (this.renderCallback) {
        this.renderCallback();
      }
    });

    return this.controls;
  }

  /**
   * Create a mesh
   */
  createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    if (parent) {
      parent.add(mesh);
    } else {
      this.scene.add(mesh);
    }
    return mesh;
  }

  /**
   * Create a group/node
   */
  createNode(parent?: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    if (parent) {
      parent.add(group);
    } else {
      this.scene.add(group);
    }
    return group;
  }

  /**
   * Create a material
   */
  createMaterial(options: {
    color?: string | number;
    roughness?: number;
    metalness?: number;
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    transparent?: boolean;
    opacity?: number;
  }): THREE.MeshStandardMaterial {
    // Only include defined properties to avoid Three.js warnings
    const materialConfig: any = {
      color: options.color || 0xffffff,
      roughness: options.roughness !== undefined ? options.roughness : 0.5,
      metalness: options.metalness !== undefined ? options.metalness : 0
    };

    // Only add optional properties if they are defined and not null/undefined
    if (options.map !== undefined && options.map !== null) materialConfig.map = options.map;
    if (options.normalMap !== undefined && options.normalMap !== null) materialConfig.normalMap = options.normalMap;
    if (options.transparent !== undefined && options.transparent !== null) materialConfig.transparent = options.transparent;
    if (options.opacity !== undefined && options.opacity !== null) materialConfig.opacity = options.opacity;

    return new THREE.MeshStandardMaterial(materialConfig);
  }

  /**
   * Create directional light
   */
  createDirectionalLight(position: number[], color: string | number = 0xffffff, intensity: number = 1): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(position[0], position[1], position[2]);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500;
    light.shadow.bias = -0.0005;
    this.scene.add(light);
    return light;
  }

  /**
   * Create ambient light
   */
  createAmbientLight(color: string | number = 0xffffff, intensity: number = 0.5): THREE.AmbientLight {
    const light = new THREE.AmbientLight(color, intensity);
    this.scene.add(light);
    return light;
  }

  /**
   * Load texture
   */
  loadTexture(
    url: string,
    options?: {
      wrapS?: THREE.Wrapping;
      wrapT?: THREE.Wrapping;
      repeat?: [number, number];
      anisotropy?: number;
    }
  ): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          if (options) {
            if (options.wrapS) texture.wrapS = options.wrapS;
            if (options.wrapT) texture.wrapT = options.wrapT;
            if (options.repeat) texture.repeat.set(options.repeat[0], options.repeat[1]);
            if (options.anisotropy) texture.anisotropy = options.anisotropy;
          }
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Load texture synchronously (actually async but for API compatibility)
   */
  loadTextureSync(url: string, options?: any): THREE.Texture {
    const texture = new THREE.TextureLoader().load(url);
    if (options) {
      if (options.wrapS) texture.wrapS = options.wrapS;
      if (options.wrapT) texture.wrapT = options.wrapT;
      if (options.repeat) texture.repeat.set(options.repeat[0], options.repeat[1]);
      if (options.anisotropy) texture.anisotropy = Math.min(options.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    }
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Load HDR environment map using HDRLoader (modern Three.js standard)
   * HDRLoader is the recommended loader for RGBE/HDR format files
   */
  loadHDREnvironment(
    url: string,
    exposure: number = 1.0
  ): Promise<{
    texture: THREE.DataTexture;
    envMap: THREE.Texture;
  }> {
    return new Promise((resolve, reject) => {
      const loader = new HDRLoader();
      // HDRLoader uses HalfFloatType by default (can be changed to FloatType if needed)

      loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.scene.environment = texture;
          this.scene.background = texture;
          this.renderer.toneMappingExposure = exposure;
          resolve({
            texture: texture,
            envMap: texture
          });
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Create gradient background texture
   */
  createGradientTexture(colors: string[], direction: "horizontal" | "vertical" = "horizontal"): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    const size = 1024;
    canvas.width = direction === "horizontal" ? size : 256;
    canvas.height = direction === "horizontal" ? 256 : size;

    const ctx = canvas.getContext("2d")!;
    const gradient = direction === "horizontal" ? ctx.createLinearGradient(0, 0, canvas.width, 0) : ctx.createLinearGradient(0, 0, 0, canvas.height);

    // Add color stops
    colors.forEach((color, index) => {
      gradient.addColorStop(index / (colors.length - 1), color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Create ambient cubemap light (simplified version)
   */
  createAmbientCubemapLight(url: string, exposure: number = 1.0, intensity: number = 1.0, _secondIntensity?: number): Promise<any> {
    return this.loadHDREnvironment(url, exposure).then((result) => {
      // Add ambient light
      this.createAmbientLight(0xffffff, intensity * 0.5);

      return {
        specular: {
          cubemap: result.texture
        },
        texture: result.texture
      };
    });
  }

  /**
   * Render the scene
   */
  render(): void {
    if (this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Set render callback
   */
  onRender(callback: () => void): void {
    this.renderCallback = callback;
  }

  /**
   * Start render loop
   */
  private startRenderLoop(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.render();
    };
    animate();
  }

  /**
   * Stop render loop
   */
  stopRenderLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  /**
   * Handle window resize
   */
  private onWindowResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      const aspect = width / height;
      const size = 50; // Should match createOrthographicCamera size
      this.camera.left = -size * aspect;
      this.camera.right = size * aspect;
      this.camera.top = size;
      this.camera.bottom = -size;
      this.camera.updateProjectionMatrix();
    }

    this.renderer.setSize(width, height);
    this.render();
  }

  /**
   * Get aspect ratio
   */
  getAspect(): number {
    return this.container.clientWidth / this.container.clientHeight;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener("resize", this.onWindowResize.bind(this));
    this.renderer.dispose();
    if (this.controls) {
      this.controls.dispose();
    }
  }
}

/**
 * Create a Three.js application (API compatible with claygl)
 */
export function createThreeApp(
  container: string | HTMLElement,
  config: {
    autoRender?: boolean;
    devicePixelRatio?: number;
    init?: (app: any) => void | Promise<any>;
    loop?: (app: any) => void;
    methods?: any;
  }
): any {
  const app = new ThreeApp({
    container,
    autoRender: config.autoRender,
    devicePixelRatio: config.devicePixelRatio
  });

  // Create API wrapper for compatibility
  const appWrapper: any = {
    scene: app.scene,
    camera: app.camera,
    renderer: app.renderer,
    container: app.container,

    // Methods
    createCamera: (position: number[], target: number[], type: "perspective" | "ortho" = "perspective") => {
      if (type === "ortho") {
        return app.createOrthographicCamera(position, target);
      } else {
        return app.createPerspectiveCamera(position, target);
      }
    },

    createNode: (parent?: THREE.Object3D) => app.createNode(parent),

    createMesh: (geometry: THREE.BufferGeometry, material: THREE.Material, parent?: THREE.Object3D) => app.createMesh(geometry, material, parent),

    createMaterial: (options: any) => app.createMaterial(options),

    createDirectionalLight: (position: number[], color: string | number, intensity?: number) =>
      app.createDirectionalLight(position, color, intensity),

    createAmbientLight: (color: string | number, intensity?: number) => app.createAmbientLight(color, intensity),

    createAmbientCubemapLight: (url: string, exposure: number, intensity: number, secondIntensity?: number) =>
      app.createAmbientCubemapLight(url, exposure, intensity, secondIntensity),

    loadTexture: (url: string, options?: any) => app.loadTexture(url, options),

    loadTextureSync: (url: string, options?: any) => app.loadTextureSync(url, options),

    createGradientTexture: (colors: string[], direction?: "horizontal" | "vertical") => 
      app.createGradientTexture(colors, direction),

    render: () => app.render(),

    resize: () => {
      const width = app.container.clientWidth;
      const height = app.container.clientHeight;
      app.renderer.setSize(width, height);
      if (app.camera instanceof THREE.PerspectiveCamera) {
        app.camera.aspect = width / height;
        app.camera.updateProjectionMatrix();
      } else if (app.camera instanceof THREE.OrthographicCamera) {
        const aspect = width / height;
        const size = 50;
        app.camera.left = -size * aspect;
        app.camera.right = size * aspect;
        app.camera.top = size;
        app.camera.bottom = -size;
        app.camera.updateProjectionMatrix();
      }
    },

    // Additional properties
    methods: config.methods || {},
    timeline: {
      // Stub for compatibility
      on: () => {},
      off: () => {}
    }
  };

  // Call init if provided
  if (config.init) {
    const initResult = config.init(appWrapper);
    if (initResult instanceof Promise) {
      initResult.then(() => {
        if (config.loop) {
          // Set up loop if provided
          const loop = () => {
            config.loop!(appWrapper);
            requestAnimationFrame(loop);
          };
          loop();
        }
      });
    } else {
      if (config.loop) {
        const loop = () => {
          config.loop!(appWrapper);
          requestAnimationFrame(loop);
        };
        loop();
      }
    }
  }

  return appWrapper;
}
