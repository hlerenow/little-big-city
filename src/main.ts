/* global mapboxgl */
import './styles/main.css';
import { extrudeGeoJSON, extrudePolygon } from './extrude-adapter';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createThreeApp } from './three-app';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import * as dat from 'dat.gui';
import { LRUCache } from 'lru-cache';
import quickhull from 'quickhull3d';
import toOBJ from './toOBJ';
import JSZip from 'jszip';
// import tessellate from './tessellate'; // Temporarily disabled - needs Vector3 API migration
import PolyBool from 'polybooljs';
import distortion from './distortion';
import * as maptalks from 'maptalks';

// Declare global saveAs function from FileSaver.js
declare const saveAs: (data: Blob, filename: string) => void;

interface Config {
    radius: number;
    curveness: number;
    showEarth: boolean;
    earthDepth: number;
    earthColor: string;
    showBuildings: boolean;
    buildingsColor: string;
    showRoads: boolean;
    roadsColor: string;
    showWater: boolean;
    waterColor: string;
    showCloud: boolean;
    cloudColor: string;
    rotateSpeed: number;
    sky: boolean;
}

interface UrlOpts {
    lng?: number;
    lat?: number;
    style?: string;
    config?: string;
    [key: string]: string | number | boolean | undefined;
}

interface VectorElementConfig {
    type: string;
    geometryType: string;
    depth: number | ((feature: any) => number);
}

const mvtCache = new LRUCache<string, any>({ max: 50 });

const DEFAULT_LNG: number = -74.0130345;
const DEFAULT_LAT: number = 40.7063516;

const DEFAULT_CONFIG: Config = {
    radius: 60,
    curveness: 1,

    showEarth: true,
    earthDepth: 4,
    earthColor: '#c2ebb6',

    showBuildings: true,
    buildingsColor: '#fab8b8',

    showRoads: true,
    roadsColor: '#828282',

    showWater: true,
    waterColor: '#80a9d7',

    showCloud: true,
    cloudColor: '#fff',

    rotateSpeed: 0,
    sky: true
};

const searchStr = location.search.slice(1);
const searchItems = searchStr.split('&');
const urlOpts: UrlOpts = {};
searchItems.forEach((item: string) => {
    const arr = item.split('=');
    const key = arr[0];
    const val: string | boolean = arr[1] || true;
    if (key) {
        (urlOpts as any)[key] = val;
    }
});
urlOpts.lng = Number(urlOpts.lng) || DEFAULT_LNG;
urlOpts.lat = Number(urlOpts.lat) || DEFAULT_LAT;

function makeUrl(): string {
    const diffConfig: any = {};
    for (let key in config) {
        if ((config as any)[key] !== (DEFAULT_CONFIG as any)[key]) {
            diffConfig[key] = (config as any)[key];
        }
    }
    urlOpts.config = encodeURIComponent(JSON.stringify(diffConfig));

    const urlItems: string[] = [];
    for (let key in urlOpts) {
        urlItems.push(key + '=' + urlOpts[key]);
    }
    return './?' + urlItems.join('&');
}

const IS_TILE_STYLE: boolean = urlOpts.style === 'tile';

// const TILE_SIZE = IS_TILE_STYLE ? 512 : 256;
const TILE_SIZE: number = 256;

const config: Config = Object.assign({}, DEFAULT_CONFIG);
try {
    Object.assign(config, JSON.parse(decodeURIComponent(urlOpts.config || '{}')));
}
catch (e) {}

// Need to define appInstance first before creating actions
let appInstance: any = null;

const actions = {
    downloadOBJ: (() => {
        let downloading = true;
        return () => {
            if (downloading) {
                return;
            }
            const {obj, mtl} = toOBJ(app.scene, {
                mtllib: 'city'
            });
            const zip = new JSZip();
            zip.file('city.obj', obj);
            zip.file('city.mtl', mtl);
            zip.generateAsync({type: 'blob', compression: 'DEFLATE' })
                .then((content: Blob) => {
                    downloading = true;
                    saveAs(content, 'city.zip');
                }).catch((e: any) => {
                    downloading = true;
                    console.error(e.toString());
                });
            // Behind all processing in case some errror happens.
            downloading = true;
        };
    })(),
    randomCloud: () => {
        app.methods.generateClouds();
    },
    reset: () => {
        Object.assign(config, DEFAULT_CONFIG);
        ui.updateDisplay();
        (window.location as any) = makeUrl();
    }
};

const mvtUrlTpl: string = `https://tile.nextzen.org/tilezen/vector/v1/${TILE_SIZE}/all/{z}/{x}/{y}.mvt?api_key=EWFsMD1DSEysLDWd2hj2cw`;

const mainLayer: any = new maptalks.TileLayer('base', {
    tileSize: [TILE_SIZE, TILE_SIZE],
    urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c']
});
const map: any = new maptalks.Map('map-main', {
    // center: [-0.113049, 51.498568],
    // center: [-73.97332, 40.76462],
    center: [urlOpts.lng, urlOpts.lat],
    zoom: 16,
    baseLayer: mainLayer
});
map.setMinZoom(16);
map.setMaxZoom(16);

const faces: string[] = [
    'pz', 'px', 'nz',
    'py', 'nx', 'ny'
];

const vectorElements: VectorElementConfig[] = [{
    type: 'buildings',
    geometryType: 'polygon',
    depth: (feature: any) => {
        return (feature.properties.height || 30) / 10 + 1;
    }
}, {
    type: 'roads',
    geometryType: 'polyline',
    depth: 1.2
}, {
    type: 'water',
    geometryType: 'polygon',
    depth: 1
}];

function iterateFeatureCoordinates(feature: any, cb: (coords: any) => any): void {
    const geometry = feature.geometry;
    if (geometry.type === 'MultiPolygon') {
        for (let i = 0; i < geometry.coordinates.length; i++) {
            for (let k = 0; k < geometry.coordinates[i].length; k++) {
                geometry.coordinates[i][k] = cb(geometry.coordinates[i][k]);
            }
        }
    }
    else if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
        for (let i = 0; i < geometry.coordinates.length; i++) {
            geometry.coordinates[i] = cb(geometry.coordinates[i]);
        }
    }
    else if (geometry.type === 'LineString') {
        geometry.coordinates = cb(geometry.coordinates);
    }
}

function subdivideLongEdges(features: any[], maxDist: number): void {

    function addPoints(points: any[]): any[] {
        const newPoints: any[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = new THREE.Vector2(points[i][0], points[i][1]);
            const p2 = new THREE.Vector2(points[i + 1][0], points[i + 1][1]);
            const v = p2.clone().sub(p1);
            const dist = v.length();
            v.normalize();

            newPoints.push(points[i]);
            for (let d = maxDist; d < dist; d += maxDist) {
                const newPoint = p1.clone().add(v.clone().multiplyScalar(d));
                newPoints.push([newPoint.x, newPoint.y]);
            }
        }
        newPoints.push(points[points.length - 1]);
        return newPoints;
    }

    features.forEach((feature: any) => {
        iterateFeatureCoordinates(feature, addPoints);
    });
}

function scaleFeature(feature: any, offset: number[], scale: number[]): void {
    function scalePoints(pts: any[]): any[] {
        for (let i = 0; i < pts.length; i++) {
            pts[i][0] = (pts[i][0] + offset[0]) * scale[0];
            pts[i][1] = (pts[i][1] + offset[1]) * scale[1];
        }
        return pts;
    }
    iterateFeatureCoordinates(feature, scalePoints);
}

function unionComplexPolygons(features: any[]): any {
    const mergedCoordinates: any[] = [];
    features.forEach((feature: any) => {
        const geometry = feature.geometry;
        if (geometry.type === 'Polygon') {
            mergedCoordinates.push(feature.geometry.coordinates);
        }
        else if (geometry.type === 'MultiPolygon') {
            for (let i = 0; i < feature.geometry.coordinates.length; i++) {
                mergedCoordinates.push(feature.geometry.coordinates[i]);
            }
        }
    });
    const poly = PolyBool.polygonFromGeoJSON({
        type: 'MultiPolygon',
        coordinates: mergedCoordinates
    });
    return {
        type: 'Feature',
        properties: {},
        geometry: PolyBool.polygonToGeoJSON(poly)
    };
}

function cullBuildingPolygns(features: any[]): void {
    const earthCoords = [getRectCoords(earthRect)];
    features.forEach((feature: any) => {
        if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
            const poly = PolyBool.polygonFromGeoJSON(feature.geometry);
            const intersectedPoly = PolyBool.intersect(
                { regions: earthCoords, inverse: false },
                poly
            );
            feature.geometry = PolyBool.polygonToGeoJSON(intersectedPoly);
            if (!feature.geometry.coordinates.length) {
                feature.geometry = null;
            }
        }
    });
}

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function unionRect(out: Rect, a: Rect, b: Rect): void {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    out.x = x;
    out.y = y;
    out.width = Math.max(a.width + a.x, b.width + b.x) - x;
    out.height = Math.max(a.height + a.y, b.height + b.y) - y;
}

const width: number = 55;
const height: number = 58.5;
const earthRect: Rect = {
    x: -width / 2,
    y: -height / 2,
    width: width,
    height: height
};

function getRectCoords(rect: Rect): number[][] {
    return [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x + rect.width, rect.y + rect.height],
        [rect.x, rect.y + rect.height],
        [rect.x, rect.y]
    ];
}

const app: any = appInstance = createThreeApp('#viewport', {

    autoRender: false,

    devicePixelRatio: 1,

    init(app: any) {

        // Three.js renderer setup
        app.renderer.shadowMap.enabled = true;
        app.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        app.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        app.renderer.toneMappingExposure = 1.0;

        const camera = app.createCamera([0, 0, 170], [0, 0, 0], IS_TILE_STYLE ? 'ortho' : 'perspective');
        if (IS_TILE_STYLE) {
            const aspect = app.renderer.domElement.width / app.renderer.domElement.height;
            (camera as THREE.OrthographicCamera).top = 50;
            (camera as THREE.OrthographicCamera).bottom = -50;
            (camera as THREE.OrthographicCamera).left = -50 * aspect;
            (camera as THREE.OrthographicCamera).right = 50 * aspect;
            (camera as THREE.OrthographicCamera).near = 0;
            (camera as THREE.OrthographicCamera).far = 1000;
            camera.updateProjectionMatrix();
        }
        this._camera = camera;

        this._earthNode = app.createNode();
        this._cloudsNode = app.createNode();

        this._elementsNodes = {};
        this._elementsMaterials = {};

        this._diffuseTex = app.loadTextureSync('/assets/paper-detail.png', {
            anisotropy: 8,
            repeat: [10, 10]
        });

        vectorElements.forEach(el => {
            this._elementsNodes[el.type] = app.createNode();
            if (IS_TILE_STYLE) {
                this._elementsNodes[el.type].rotation.x = -Math.PI / 2;
            }
            const material = app.createMaterial({
                map: this._diffuseTex,
                color: config[el.type + 'Color'],
                roughness: 1,
                metalness: 0
            });
            if (this._diffuseTex) {
                this._diffuseTex.wrapS = THREE.RepeatWrapping;
                this._diffuseTex.wrapT = THREE.RepeatWrapping;
                this._diffuseTex.repeat.set(10, 10);
            }
            material.name = 'mat_' + el.type;
            this._elementsMaterials[el.type] = material;
        });

        // Create directional light with increased intensity for planet mode
        const lightIntensity = IS_TILE_STYLE ? 1 : 2;
        const light = app.createDirectionalLight([-1, -1, -1], '#fff', lightIntensity);
        light.shadow.mapSize.width = 2048;
        light.shadow.mapSize.height = 2048;
        light.shadow.bias = IS_TILE_STYLE ? 0.01 : 0.0005;
        light.castShadow = true;

        this._control = new OrbitControls(camera, app.renderer.domElement);
        this._control.enableDamping = true;
        this._control.dampingFactor = 0.05;
        this._control.addEventListener('change', () => {
            app.render();
        });

        if (!IS_TILE_STYLE) {
            app.methods.updateEarthSphere.call(this, app);
        } else {
            // Initialize ground for tile mode
            app.methods.updateEarthGround.call(this, app, null);
        }
        app.methods.updateElements.call(this, app);
        app.methods.updateVisibility.call(this, app);
        app.methods.generateClouds.call(this, app);

        app.render();

        // Create sky blue gradient background (from light sky blue to deeper sky blue)
        const gradientTexture = app.createGradientTexture(
            ['#87CEEB', '#4A9FD8'],  // Light sky blue to deeper sky blue
            'vertical'
        );
        this._skybox = { visible: true, texture: gradientTexture };

        // Add stronger ambient light for planet mode
        const ambientIntensity = IS_TILE_STYLE ? 0.8 : 1.5;
        app.createAmbientLight(0xffffff, ambientIntensity);

        // Set gradient as environment for material reflections (optional)
        if (!IS_TILE_STYLE) {
            app.scene.environment = gradientTexture;
        }

        // Apply sky visibility based on config.sky
        app.methods.updateSky.call(this, app);
    },

    loop(app: any) {
        // Three.js handles rendering differently
        if (app._control) {
            app._control.update();
        }
    },

    methods: {
        updateEarthSphere(app) {
            if (!this._earthNode) {
                console.warn('updateEarthSphere: _earthNode not initialized');
                return;
            }

            // Remove all children
            while (this._earthNode.children.length > 0) {
                const child = this._earthNode.children[0];
                this._earthNode.remove(child);
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }

            const earthMat = app.createMaterial({
                roughness: 1,
                color: config.earthColor,
                map: this._diffuseTex
            });
            if (this._diffuseTex) {
                this._diffuseTex.wrapS = THREE.RepeatWrapping;
                this._diffuseTex.wrapT = THREE.RepeatWrapping;
                this._diffuseTex.repeat.set(2, 2);
            }
            earthMat.name = 'mat_earth';

            faces.forEach(face => {
                const planeGeo = new THREE.PlaneGeometry(2, 2, 20, 20);
                const mesh = app.createMesh(planeGeo, earthMat, this._earthNode);

                // Apply distortion
                const positions = planeGeo.attributes.position.array as Float32Array;
                distortion(
                    positions,
                    {x: -1, y: -1, width: 2, height: 2},
                    config.radius,
                    config.curveness,
                    face
                );
                planeGeo.attributes.position.needsUpdate = true;
                planeGeo.computeVertexNormals();
            });

            if (this._cloudsNode && this._cloudsNode.children) {
                this._cloudsNode.children.forEach((cloudMesh: any) => {
                    if (cloudMesh.height !== undefined) {
                        const dist = cloudMesh.height + config.radius / Math.sqrt(2);
                        cloudMesh.position.normalize().multiplyScalar(dist);
                    }
                });
            }

            app.render();
        },

        updateEarthGround(app, rect) {
            if (!this._earthNode) {
                console.warn('updateEarthGround: _earthNode not initialized');
                return;
            }

            // Remove all children
            while (this._earthNode.children.length > 0) {
                const child = this._earthNode.children[0];
                this._earthNode.remove(child);
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }

            const {position, uv, normal, indices} = extrudePolygon(
                [[getRectCoords(rect || earthRect)]], {
                    depth: config.earthDepth
                }
            );

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            geo.setIndex(new THREE.BufferAttribute(indices, 1));
            geo.computeBoundingSphere();

            const earthMat = app.createMaterial({
                roughness: 1,
                color: config.earthColor,
                map: this._diffuseTex
            });
            // Enable double-sided rendering for tile mode ground
            earthMat.side = THREE.DoubleSide;
            if (this._diffuseTex) {
                this._diffuseTex.wrapS = THREE.RepeatWrapping;
                this._diffuseTex.wrapT = THREE.RepeatWrapping;
                this._diffuseTex.repeat.set(2, 2);
            }
            earthMat.name = 'mat_earth';

            const mesh = app.createMesh(geo, earthMat, this._earthNode);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = -config.earthDepth + 0.1;

            if (app && app.methods && app.methods.render) {
                app.methods.render.call(this, app);
            }
        },

        updateElements(app) {
            this._id = Math.random();
            const advRenderer = this._advRenderer;
            const elementsNodes = this._elementsNodes;
            const elementsMaterials = this._elementsMaterials;
            for (let key in elementsNodes) {
                // Remove all children from the node
                while (elementsNodes[key].children.length > 0) {
                    const child = elementsNodes[key].children[0];
                    elementsNodes[key].remove(child);
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        if (Array.isArray(child.material)) {
                            child.material.forEach((m: THREE.Material) => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            }

            for (let key in this._buildingAnimators) {
                // Cancel animation frame instead of calling stop()
                const animId = this._buildingAnimators[key];
                if (typeof animId === 'number') {
                    cancelAnimationFrame(animId);
                }
            }
            const buildingAnimators = this._buildingAnimators = {};
            
            // Collect geometry data from all tiles before merging
            const geometryDataCollector = {
                buildings: [],
                roads: [],
                water: []
            };

            function createElementMesh(elConfig, features, boundingRect, idx) {

                // 打印建筑物原始信息
                if (elConfig.type === 'buildings') {
                    console.log('=== 建筑物原始信息 ===');
                    console.log('瓦片索引:', idx);
                    console.log('建筑物数量:', features.length);
                    console.log('\n前 3 个建筑物的完整数据:');
                    features.slice(0, 3).forEach((feature, i) => {
                        console.log(`\n--- 建筑物 ${i + 1} ---`);
                        console.log('GeoJSON 类型:', feature.type);
                        console.log('几何类型:', feature.geometry?.type);
                        console.log('属性 (properties):', feature.properties);
                        console.log('坐标数组长度:', 
                            feature.geometry?.type === 'Polygon' 
                                ? feature.geometry.coordinates[0]?.length 
                                : feature.geometry?.coordinates?.length
                        );
                        if (feature.geometry?.coordinates) {
                            console.log('前 3 个坐标点:', 
                                feature.geometry.type === 'Polygon'
                                    ? feature.geometry.coordinates[0]?.slice(0, 3)
                                    : feature.geometry.coordinates.slice(0, 3)
                            );
                        }
                        
                        // 计算挤压深度
                        const height = feature.properties?.height || 30;
                        const depth = typeof elConfig.depth === 'function' 
                            ? elConfig.depth(feature) 
                            : elConfig.depth;
                        console.log('高度:', height, 'm');
                        console.log('挤压深度:', depth.toFixed(2), '单位');
                    });
                    
                    if (features.length > 3) {
                        console.log(`\n... 还有 ${features.length - 3} 个建筑物`);
                    }
                    
                    // 统计信息
                    console.log('\n统计信息:');
                    const heights = features.map(f => f.properties?.height || 30);
                    console.log('最小高度:', Math.min(...heights), 'm');
                    console.log('最大高度:', Math.max(...heights), 'm');
                    console.log('平均高度:', (heights.reduce((a, b) => a + b, 0) / heights.length).toFixed(2), 'm');
                }

                if (!IS_TILE_STYLE && elConfig.type === 'roads' || elConfig.type === 'water') {
                    subdivideLongEdges(features, 4);
                }
                const result = extrudeGeoJSON({features: features}, {
                    lineWidth: 0.5,
                    excludeBottom: true,
                    simplify: (IS_TILE_STYLE || elConfig.type === 'buildings') ? 0.01 : 0,
                    depth: elConfig.depth
                });
                const poly = result[elConfig.geometryType];
                
                // 打印几何体信息
                if (elConfig.type === 'buildings') {
                    console.log('几何体信息:');
                    console.log('  顶点数:', poly.position.length / 3);
                    console.log('  三角形数:', poly.indices.length / 3);
                    console.log('  索引类型:', poly.indices.constructor.name);
                    console.log('==================\n');
                }

                // Temporarily disable tessellation for water (requires claygl Vector3 API migration)
                // if (!IS_TILE_STYLE && elConfig.type === 'water') {
                //     const {indices, position} = tessellate(poly.position, poly.indices, 5);
                //     poly.indices = indices;
                //     poly.position = position;
                // }

                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(poly.position, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(poly.normal, 3));
                geo.setAttribute('uv', new THREE.BufferAttribute(poly.uv, 2));
                geo.setIndex(new THREE.BufferAttribute(poly.indices, 1));

                const mesh = app.createMesh(geo, elementsMaterials[elConfig.type], elementsNodes[elConfig.type]);
                if (elConfig.type === 'buildings') {
                    let positionAnimateFrom = new Float32Array(poly.position);
                    let positionAnimateTo = poly.position;
                    for (let i = 0; i < positionAnimateFrom.length; i += 3) {
                        const z = positionAnimateFrom[i + 2];
                        if (z > 0) {
                            positionAnimateFrom[i + 2] = 1;
                        }
                    }

                    if (!IS_TILE_STYLE) {
                        positionAnimateTo = distortion(
                            poly.position, boundingRect, config.radius, config.curveness, faces[idx]
                        ) as Float32Array;
                        positionAnimateFrom = distortion(
                            positionAnimateFrom, boundingRect, config.radius, config.curveness, faces[idx]
                        ) as Float32Array;
                    }
                    // Will be set below after transition position is initialized
                    geo.computeVertexNormals();
                    geo.computeBoundingBox();

                    const transitionPosition = new Float32Array(positionAnimateFrom);
                    geo.setAttribute('position', new THREE.BufferAttribute(transitionPosition, 3));

                    mesh.visible = true;

                    // Simple animation replacement (claygl timeline -> setTimeout)
                    // TODO: Use a proper animation library like GSAP or anime.js
                    setTimeout(() => {
                        const duration = 2000;
                        const startTime = Date.now();

                        const animate = () => {
                            const elapsed = Date.now() - startTime;
                            const progress = Math.min(elapsed / duration, 1);

                            // Elastic out easing approximation
                            const p = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);

                            mesh.visible = true;
                            for (let i = 0; i < transitionPosition.length; i++) {
                                const a = positionAnimateFrom[i];
                                const b = positionAnimateTo[i];
                                transitionPosition[i] = (b - a) * p + a;
                            }
                            geo.attributes.position.needsUpdate = true;
                            app.render();

                            if (progress < 1) {
                                buildingAnimators[faces[idx]] = requestAnimationFrame(animate);
                            }
                        };

                        animate();
                    }, 1000);
                }
                else {
                    let finalPosition: Float32Array;
                    if (IS_TILE_STYLE) {
                        finalPosition = poly.position;
                    }
                    else {
                        finalPosition = distortion(
                            poly.position, boundingRect,
                            config.radius, config.curveness, faces[idx]
                        ) as Float32Array;
                    }
                    geo.setAttribute('position', new THREE.BufferAttribute(finalPosition, 3));
                    geo.computeVertexNormals();
                    geo.computeBoundingBox();
                }

                return {boundingRect: poly.boundingRect};
            }

            let tiles = mainLayer.getTiles().tileGrids[0].tiles;
            const subdomains = ['a', 'b', 'c'];
            // Remove the overly strict tile filter for tile mode
            // This was causing tile mode to only load 1 tile (containing center point)
            // while planet mode loads up to 6 tiles
            // Now both modes load the same tiles for consistency
            let loading = Math.min(tiles.length, 6);
            tiles.forEach((tile, idx) => {
                const fetchId = this._id;
                if (idx >= 6) {
                    return;
                }
                const extent = tile.extent2d.convertTo(c => map.pointToCoord(c)).toJSON();

                const scaleX = 1e4;
                const scaleY = scaleX * 1.4;
                const width = (extent.xmax - extent.xmin) * scaleX;
                const height = (extent.ymax - extent.ymin) * scaleY;
                const tileRect = {
                    x: IS_TILE_STYLE ? -width / 2 : 0,
                    y: IS_TILE_STYLE ? -height / 2 : 0,
                    width: width,
                    height: height
                };
                const allBoundingRect = {
                    x: Infinity,
                    y: Infinity,
                    width: -Infinity,
                    height: -Infinity
                };

                const url = mvtUrlTpl.replace('{z}', tile.z)
                    .replace('{x}', tile.x)
                    .replace('{y}', tile.y)
                    .replace('{s}', subdomains[idx % 3]);

                if (mvtCache.get(url)) {
                    const features = mvtCache.get(url);
                    for (let key in features) {
                        createElementMesh(
                            vectorElements.find(config => config.type === key),
                            features[key],
                            tileRect, idx
                        );
                    }

                    return;
                }

                return fetch(url, {
                    mode: 'cors'
                }).then(response => response.arrayBuffer())
                    .then(buffer => {
                        if (fetchId !== this._id) {
                            return;
                        }

                        const pbf = new Protobuf(new Uint8Array(buffer));
                        const vTile = new VectorTile(pbf);
                        if (!vTile.layers.buildings) {
                            return;
                        }

                        const features = {};
                        ['buildings', 'roads', 'water'].forEach(type => {
                            if (!vTile.layers[type]) {
                                return;
                            }
                            features[type] = [];
                            for (let i = 0; i < vTile.layers[type].length; i++) {
                                const feature = vTile.layers[type].feature(i).toGeoJSON(tile.x, tile.y, tile.z);
                                scaleFeature(
                                    feature, IS_TILE_STYLE
                                        ? [-(extent.xmax + extent.xmin) / 2, -(extent.ymax + extent.ymin) / 2]
                                        : [-extent.xmin, -extent.ymin]
                                    , [scaleX, scaleY]
                                );
                                features[type].push(feature);
                            }

            if (IS_TILE_STYLE && features[type]) {
                cullBuildingPolygns(features[type]);
            }
                        });

                        if ((features as any).water) {
                            (features as any).water = [unionComplexPolygons((features as any).water.filter((feature: any) => {
                                const geoType = feature.geometry && feature.geometry.type;
                                return geoType === 'Polygon' || geoType === 'MultiPolygon';
                            }))];
                        }
                        if ((features as any).roads) {
                            (features as any).roads = (features as any).roads.filter((feature: any) => {
                                const geoType = feature.geometry && feature.geometry.type;
                                return geoType === 'LineString' || geoType === 'MultiLineString';
                            });
                        }

                        mvtCache.set(url, features);
                        for (let key in features) {
                            const {boundingRect} = createElementMesh(
                                vectorElements.find(config => config.type === key),
                                features[key],
                                tileRect, idx
                            );
                            unionRect(allBoundingRect, boundingRect, allBoundingRect);
                        }

                        loading--;
                        if (IS_TILE_STYLE) {
                            if (loading === 0) {
                                app.methods.updateEarthGround.call(this, app, allBoundingRect);
                            }
                        }

                        if (app && app.methods && app.methods.render) {
                            app.methods.render.call(this, app);
                        }
                    });
            });
        },

        generateClouds(app) {
            if (!this._cloudsNode) {
                console.warn('generateClouds: _cloudsNode not initialized');
                return;
            }
            
            const cloudNumber = IS_TILE_STYLE ? 10 : 15;
            const pointCount = 100;

            // Remove all children from clouds node
            while (this._cloudsNode.children.length > 0) {
                const child = this._cloudsNode.children[0];
                this._cloudsNode.remove(child);
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m: THREE.Material) => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }

            const cloudMaterial = app.createMaterial({
                roughness: 1,
                color: config.cloudColor
            });
            cloudMaterial.name = 'mat_cloud';

            function randomInSphere(r) {
                const alpha = Math.random() * Math.PI * 2;
                const beta = Math.random() * Math.PI;

                const r2 = Math.sin(beta) * r;
                const y = Math.cos(beta) * r;
                const x = Math.cos(alpha) * r2;
                const z = Math.sin(alpha) * r2;
                return [x, y, z];
            }
            for (let i = 0; i < cloudNumber; i++) {
                const positionArr = new Float32Array(5 * pointCount * 3);
                let off = 0;
                let indices = [];

                let dx = Math.random() - 0.5;
                let dy = Math.random() - 0.5;
                const len = Math.sqrt(dx * dx + dy * dy);
                dx /= len; dy /= len;

                const dist = 4 + Math.random() * 2;

                for (let i = 0; i < 5; i++) {
                    const posOff = (i - 2) + (Math.random() * 0.4 - 0.2);
                    const rBase = 3 - Math.abs(posOff);
                    const points = [];
                    const vertexOffset = off / 3;
                    for (let i = 0; i < pointCount; i++) {
                        const r = Math.random() * rBase + rBase;
                        const pt = randomInSphere(r);
                        points.push(pt);
                        positionArr[off++] = pt[0] + posOff * dist * dx;
                        if (IS_TILE_STYLE) {
                            positionArr[off++] = pt[1];
                            positionArr[off++] = pt[2] + posOff * dist * dy;
                        }
                        else {
                            positionArr[off++] = pt[1] + posOff * dist * dy;
                            positionArr[off++] = pt[2];
                        }
                    }
                    const tmp = quickhull(points);
                    for (let m = 0; m < tmp.length; m++) {
                        indices.push(tmp[m][0] + vertexOffset);
                        indices.push(tmp[m][1] + vertexOffset);
                        indices.push(tmp[m][2] + vertexOffset);
                    }
                }

                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positionArr, 3));
                geo.setIndex(indices);
                geo.computeVertexNormals();

                const cloudMesh = app.createMesh(geo, cloudMaterial, this._cloudsNode);
                (cloudMesh as any).height = Math.random() * 10 + 20;
                if (IS_TILE_STYLE) {
                    cloudMesh.position.set(
                        (Math.random() - 0.5) * 60,
                        Math.random() * 10 + 25,
                        (Math.random() - 0.5) * 60
                    );
                    if (IS_TILE_STYLE) {
                        cloudMesh.scale.set(0.6, 0.6, 0.6);
                    }
                }
                else {
                    const pos = randomInSphere(config.radius / Math.sqrt(2) + (cloudMesh as any).height);
                    cloudMesh.position.set(pos[0], pos[1], pos[2]);
                    cloudMesh.lookAt(0, 0, 0);
                }
            }
            if (app && app.methods && app.methods.render) {
                app.methods.render.call(this, app);
            }
        },

        updateColor() {
            this._earthNode.children.forEach((mesh: any) => {
                if (mesh.material && mesh.material.color) {
                    mesh.material.color.set(config.earthColor);
                }
            });
            this._cloudsNode.children.forEach((mesh: any) => {
                if (mesh.material && mesh.material.color) {
                    mesh.material.color.set(config.cloudColor);
                }
            });
            for (let key in this._elementsMaterials) {
                const material = this._elementsMaterials[key];
                if (material && material.color) {
                    material.color.set(config[key + 'Color']);
                }
            }
            app.render();
        },

        render(app) {
            // Update orthographic camera aspect if needed
            if (this._camera && this._camera instanceof THREE.OrthographicCamera) {
                const aspect = app.renderer.domElement.width / app.renderer.domElement.height;
                // OrbitControls doesn't have orthographicAspect in Three.js
                // this._control.orthographicAspect = aspect;
            }
            app.render();
            // TODO
            setTimeout(() => {
                app.render();
            }, 20);
        },

        updateAutoRotate() {
            this._control.rotateSpeed = config.rotateSpeed * 50;
            this._control.autoRotate = Math.abs(config.rotateSpeed) > 0.3;
        },

        updateSky(app) {
            // Control background visibility in Three.js
            if (config.sky && this._skybox && this._skybox.texture) {
                // Show gradient background
                app.scene.background = this._skybox.texture;
                // Set as environment for material reflections
                if (!IS_TILE_STYLE) {
                    app.scene.environment = this._skybox.texture;
                }
            } else {
                // Hide background
                app.scene.background = null;
                // Keep environment for lighting even when background is hidden
            }
            app.render();
        },

        updateVisibility(app) {
            if (this._earthNode) {
                this._earthNode.visible = config.showEarth;
            }
            if (this._cloudsNode) {
                this._cloudsNode.visible = config.showCloud;
            }

            if (this._elementsNodes) {
                if (this._elementsNodes.buildings) {
                    this._elementsNodes.buildings.visible = config.showBuildings;
                }
                if (this._elementsNodes.roads) {
                    this._elementsNodes.roads.visible = config.showRoads;
                }
                if (this._elementsNodes.water) {
                    this._elementsNodes.water.visible = config.showWater;
                }
            }

            if (app && app.methods && app.methods.render) {
                app.methods.render.call(this, app);
            }
        }
    }
});

function updateAll() {
if (!IS_TILE_STYLE) {
    app.methods.updateEarthSphere.call(app, app);
}
app.methods.updateElements.call(app, app);
}

function updateUrlState() {
    history.pushState('', '', makeUrl());
}

let timeout;
map.on('moveend', function () {
    clearTimeout(timeout);
    timeout = setTimeout(function () {
        app.methods.updateElements();
        updateUrlState();
    }, 500);
});
map.on('moving', function () {
    const center = map.getCenter();
    urlOpts.lng = (document.querySelector('#lng') as HTMLInputElement)!.value = center.x;
    urlOpts.lat = (document.querySelector('#lat') as HTMLInputElement)!.value = center.y;
});
map.on('zoomend', function () {
    clearTimeout(timeout);
    timeout = setTimeout(function () {
        app.methods.updateElements();
    }, 500);
});

Array.prototype.forEach.call(document.querySelectorAll('#style-list li'), (li: HTMLElement) => {
    li.addEventListener('click', () => {
        urlOpts.style = li.className;
        (window.location as any) = makeUrl();
    });
});

document.querySelector('#locate')!.addEventListener('click', () => {
    urlOpts.lng = +(document.querySelector('#lng') as HTMLInputElement)!.value;
    urlOpts.lat = +(document.querySelector('#lat') as HTMLInputElement)!.value;
    map.setCenter({x: urlOpts.lng, y: urlOpts.lat});
    app.methods.updateElements();
    updateUrlState();
});

document.querySelector('#reset')!.addEventListener('click', () => {
    urlOpts.lng = (document.querySelector('#lng') as HTMLInputElement)!.value = DEFAULT_LNG as any;
    urlOpts.lat = (document.querySelector('#lat') as HTMLInputElement)!.value = DEFAULT_LAT as any;
    map.setCenter({x: urlOpts.lng, y: urlOpts.lat});
    app.methods.updateElements();
    updateUrlState();
});

const ui = new dat.GUI();
ui.add(actions, 'reset');
if (!IS_TILE_STYLE) {
    ui.add(config, 'radius', 30, 100).step(1).onChange(updateAll).onFinishChange(updateUrlState);
}
ui.add(config, 'rotateSpeed', -2, 2).step(0.01).onChange(app.methods.updateAutoRotate).onFinishChange(updateUrlState);
ui.add(config, 'sky').onChange(app.methods.updateSky).onFinishChange(updateUrlState);

const earthFolder = ui.addFolder('Earth');
earthFolder.add(config, 'showEarth').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
if (IS_TILE_STYLE) {
    earthFolder.add(config, 'earthDepth', 1, 50).onChange(() => {
        app.methods.updateEarthGround.call(appInstance, appInstance, config.earthDepth);
    }).onFinishChange(updateUrlState);
}
earthFolder.addColor(config, 'earthColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

const buildingsFolder = ui.addFolder('Buildings');
buildingsFolder.add(config, 'showBuildings').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
buildingsFolder.addColor(config, 'buildingsColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

const roadsFolder = ui.addFolder('Roads');
roadsFolder.add(config, 'showRoads').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
roadsFolder.addColor(config, 'roadsColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

const waterFolder = ui.addFolder('Water');
waterFolder.add(config, 'showWater').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
waterFolder.addColor(config, 'waterColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

const cloudFolder = ui.addFolder('Cloud');
cloudFolder.add(config, 'showCloud').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
cloudFolder.addColor(config, 'cloudColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);
cloudFolder.add(actions, 'randomCloud');

ui.add(actions, 'downloadOBJ');

window.addEventListener('resize', () => { 
    if (app) {
        app.resize(); 
        if (app.methods && app.methods.render) {
            app.methods.render.call(app, app);
        }
    }
});
