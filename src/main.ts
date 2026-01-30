/**
 * Little Big City - 主入口文件
 * 
 * 功能概述：
 * - 加载并显示城市3D模型（建筑、道路、水体）
 * - 支持两种视图模式：星球模式和平铺模式
 * - 提供交互式控制和模型导出功能
 * 
 * @module main
 */

/* global mapboxgl */
import './styles/main.css';

// 核心模块
import { createThreeApp } from './core/ThreeApp';
import {
    Config,
    UrlOpts,
    DEFAULT_LNG,
    DEFAULT_LAT,
    parseUrlParams,
    loadConfigFromUrl,
    makeUrl
} from './core/config';

// 几何处理
import { extrudeGeoJSON, extrudePolygon } from './geometry/extrude-adapter';
import {
    Rect,
    getRectCoords,
    unionRect,
    subdivideLongEdges,
    scaleFeature,
    unionComplexPolygons,
    cullBuildingPolygons
} from './geometry/processors';

// 工具函数
import distortion from './utils/distortion';
// import tessellate from './utils/tessellate'; // 暂时禁用 - 需要迁移到Three.js Vector3 API

// 地图相关
import { vectorElements, cubefaces } from './map/vector-elements';
import { mvtCache, TILE_SIZE, mvtUrlTpl } from './map/tile-loader';

// UI控制
import { createUIController, setupLocationControls } from './ui/controls';

// 第三方库
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import quickhull from 'quickhull3d';
import * as maptalks from 'maptalks';

/**
 * =============================================================================
 * 初始化配置和全局变量
 * =============================================================================
 */

// 解析URL参数
const urlOpts: UrlOpts = parseUrlParams();

// 判断是否为平铺模式
const IS_TILE_STYLE: boolean = urlOpts.style === 'tile';

// 加载配置
const config: Config = loadConfigFromUrl(urlOpts);

/**
 * =============================================================================
 * 地图初始化
 * =============================================================================
 */

// 创建地图底图图层
const mainLayer: any = new maptalks.TileLayer('base', {
    tileSize: [TILE_SIZE, TILE_SIZE],
    urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c']
});

// 创建地图实例
const map: any = new maptalks.Map('map-main', {
    center: [urlOpts.lng, urlOpts.lat],
    zoom: 16,
    baseLayer: mainLayer
});

// 固定缩放级别为16
map.setMinZoom(16);
map.setMaxZoom(16);

/**
 * =============================================================================
 * 场景配置
 * =============================================================================
 */

// 地面矩形范围
const width: number = 55;
const height: number = 58.5;
const earthRect: Rect = {
    x: -width / 2,
    y: -height / 2,
    width: width,
    height: height
};

/**
 * =============================================================================
 * Three.js场景初始化
 * =============================================================================
 */

const app: any = createThreeApp('#viewport', {
    autoRender: false,
    devicePixelRatio: 1,

    /**
     * 场景初始化函数
     * 创建相机、灯光、材质、节点等场景对象
     */
    init(app: any) {
        // 配置Three.js渲染器
        app.renderer.shadowMap.enabled = true;
        app.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        app.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        app.renderer.toneMappingExposure = 1.0;

        // 创建相机（平铺模式使用正交相机，星球模式使用透视相机）
        const camera = app.createCamera([0, 0, 170], [0, 0, 0], IS_TILE_STYLE ? 'ortho' : 'perspective');
        if (IS_TILE_STYLE) {
            // 配置正交相机参数
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

        // 创建场景节点
        this._earthNode = app.createNode();  // 地面节点
        this._cloudsNode = app.createNode(); // 云朵节点

        // 初始化元素节点和材质存储
        this._elementsNodes = {};      // 存储建筑、道路、水体的节点
        this._elementsMaterials = {};  // 存储各元素的材质

        // 加载纹理贴图
        this._diffuseTex = app.loadTextureSync('/assets/paper-detail.png', {
            anisotropy: 8,
            repeat: [10, 10]
        });

        // 为每种矢量元素创建节点和材质
        vectorElements.forEach(el => {
            // 创建元素节点
            this._elementsNodes[el.type] = app.createNode();
            if (IS_TILE_STYLE) {
                // 平铺模式下，旋转节点使其平放
                this._elementsNodes[el.type].rotation.x = -Math.PI / 2;
            }
            
            // 创建材质
            const material = app.createMaterial({
                map: this._diffuseTex,
                color: config[el.type + 'Color'],
                roughness: 0.7,  // 降低粗糙度以增加光照反射
                metalness: 0
            });
            
            // 配置纹理重复
            if (this._diffuseTex) {
                this._diffuseTex.wrapS = THREE.RepeatWrapping;
                this._diffuseTex.wrapT = THREE.RepeatWrapping;
                this._diffuseTex.repeat.set(10, 10);
            }
            
            material.name = 'mat_' + el.type;
            this._elementsMaterials[el.type] = material;
        });

        // 创建方向光（显著提高强度以获得鲜艳的颜色）
        const lightIntensity = IS_TILE_STYLE ? 2 : 3;
        const light = app.createDirectionalLight([-1, -1, -1], '#fff', lightIntensity);
        light.shadow.mapSize.width = 2048;  // 阴影贴图分辨率
        light.shadow.mapSize.height = 2048;
        light.shadow.bias = IS_TILE_STYLE ? 0.01 : 0.0005;  // 阴影偏移，避免阴影失真
        light.castShadow = true;

        // 创建轨道控制器
        this._control = new OrbitControls(camera, app.renderer.domElement);
        this._control.enableDamping = true;      // 启用阻尼（惯性）
        this._control.dampingFactor = 0.05;      // 阻尼系数
        this._control.addEventListener('change', () => {
            app.render();  // 控制器变化时重新渲染
        });

        // 初始化场景元素
        if (!IS_TILE_STYLE) {
            // 星球模式：创建球形地面
            app.methods.updateEarthSphere.call(this, app);
        } else {
            // 平铺模式：创建平面地面
            app.methods.updateEarthGround.call(this, app, null);
        }
        
        // 更新建筑、道路、水体等元素
        app.methods.updateElements.call(this, app);
        app.methods.updateVisibility.call(this, app);
        app.methods.generateClouds.call(this, app);

        app.render();

        // 创建天空蓝色渐变背景
        const gradientTexture = app.createGradientTexture(
            ['#87CEEB', '#4A9FD8'],  // 从浅天空蓝到深天空蓝
            'vertical'
        );
        this._skybox = { visible: true, texture: gradientTexture };

        // 添加强环境光以获得鲜艳的颜色
        const ambientIntensity = IS_TILE_STYLE ? 1.5 : 2.5;
        app.createAmbientLight(0xffffff, ambientIntensity);

        // 在星球模式下设置渐变纹理为环境贴图
        if (!IS_TILE_STYLE) {
            app.scene.environment = gradientTexture;
        }

        // 根据配置应用天空可见性
        app.methods.updateSky.call(this, app);
    },

    /**
     * 渲染循环
     * Three.js的渲染循环处理
     */
    loop(app: any) {
        if (app._control) {
            app._control.update();
        }
    },

    /**
     * =============================================================================
     * 场景方法定义
     * =============================================================================
     */
    methods: {
        /**
         * 更新球形地面（星球模式）
         * 创建6个面的球形地面，应用变形算法
         */
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

            // 创建地面材质
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

            // 为立方体的6个面创建平面
            cubefaces.forEach(face => {
                const planeGeo = new THREE.PlaneGeometry(2, 2, 20, 20);
                const mesh = app.createMesh(planeGeo, earthMat, this._earthNode);

                // 应用球面变形
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

            // 更新云朵位置以匹配新的地面半径
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

        /**
         * 更新平面地面（平铺模式）
         */
        updateEarthGround(app, rect) {
            if (!this._earthNode) {
                console.warn('updateEarthGround: _earthNode not initialized');
                return;
            }

            // 清除所有子节点
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

            // 挤压地面多边形
            const {position, uv, normal, indices} = extrudePolygon(
                [[getRectCoords(rect || earthRect)]], {
                    depth: config.earthDepth
                }
            );

            // 创建几何体
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            geo.setIndex(new THREE.BufferAttribute(indices, 1));
            geo.computeBoundingSphere();

            // 创建地面材质
            const earthMat = app.createMaterial({
                roughness: 1,
                color: config.earthColor,
                map: this._diffuseTex
            });
            // 启用双面渲染（平铺模式地面需要）
            earthMat.side = THREE.DoubleSide;
            if (this._diffuseTex) {
                this._diffuseTex.wrapS = THREE.RepeatWrapping;
                this._diffuseTex.wrapT = THREE.RepeatWrapping;
                this._diffuseTex.repeat.set(2, 2);
            }
            earthMat.name = 'mat_earth';

            // 创建地面网格并定位
            const mesh = app.createMesh(geo, earthMat, this._earthNode);
            mesh.rotation.x = -Math.PI / 2;  // 旋转为水平
            mesh.position.y = -config.earthDepth + 0.1;  // 向下偏移

            if (app && app.methods && app.methods.render) {
                app.methods.render.call(this, app);
            }
        },

        /**
         * 更新地图元素（建筑、道路、水体）
         * 从瓦片数据加载并创建3D模型
         */
        updateElements(app) {
            this._id = Math.random();  // 生成唯一ID，用于取消过期的请求
            const elementsNodes = this._elementsNodes;
            const elementsMaterials = this._elementsMaterials;
            
            // 清除所有元素节点的子对象
            for (let key in elementsNodes) {
                while (elementsNodes[key].children.length > 0) {
                    const child = elementsNodes[key].children[0];
                    elementsNodes[key].remove(child);
                    // 释放资源
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

            // 取消所有正在进行的建筑动画
            for (let key in this._buildingAnimators) {
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

            /**
             * 创建元素网格
             * @param elConfig 元素配置
             * @param features GeoJSON特征数组
             * @param boundingRect 边界矩形
             * @param idx 瓦片索引
             */
            function createElementMesh(elConfig, features, boundingRect, idx) {

                // 调试：打印建筑物原始信息
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

                // 在星球模式下，对道路和水体进行边缘细分，以便更好地适配曲面
                if (!IS_TILE_STYLE && (elConfig.type === 'roads' || elConfig.type === 'water')) {
                    subdivideLongEdges(features, 4);
                }
                
                // 挤压GeoJSON为3D几何体
                const result = extrudeGeoJSON({features: features}, {
                    lineWidth: 0.5,
                    excludeBottom: true,  // 不生成底面
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

                // 创建Three.js几何体
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(poly.position, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(poly.normal, 3));
                geo.setAttribute('uv', new THREE.BufferAttribute(poly.uv, 2));
                geo.setIndex(new THREE.BufferAttribute(poly.indices, 1));

                // 创建网格
                const mesh = app.createMesh(geo, elementsMaterials[elConfig.type], elementsNodes[elConfig.type]);
                
                // 建筑需要特殊的动画处理
                if (elConfig.type === 'buildings') {
                    // 准备建筑生长动画
                    // 起始状态：建筑高度压缩到接近地面
                    let positionAnimateFrom = new Float32Array(poly.position);
                    let positionAnimateTo = poly.position;
                    for (let i = 0; i < positionAnimateFrom.length; i += 3) {
                        const z = positionAnimateFrom[i + 2];
                        if (z > 0) {
                            positionAnimateFrom[i + 2] = 1;  // 将所有高度设为1
                        }
                    }

                    // 在星球模式下应用球面变形
                    if (!IS_TILE_STYLE) {
                        positionAnimateTo = distortion(
                            poly.position, boundingRect, config.radius, config.curveness, cubefaces[idx]
                        ) as Float32Array;
                        positionAnimateFrom = distortion(
                            positionAnimateFrom, boundingRect, config.radius, config.curveness, cubefaces[idx]
                        ) as Float32Array;
                    }
                    
                    geo.computeVertexNormals();
                    geo.computeBoundingBox();

                    // 创建过渡位置数组用于动画
                    const transitionPosition = new Float32Array(positionAnimateFrom);
                    geo.setAttribute('position', new THREE.BufferAttribute(transitionPosition, 3));

                    mesh.visible = true;

                    // 延迟1秒后开始建筑生长动画
                    setTimeout(() => {
                        const duration = 2000;  // 动画持续2秒
                        const startTime = Date.now();

                        const animate = () => {
                            const elapsed = Date.now() - startTime;
                            const progress = Math.min(elapsed / duration, 1);

                            // 弹性缓动函数（ElasticOut）
                            const p = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);

                            mesh.visible = true;
                            // 插值计算每个顶点的位置
                            for (let i = 0; i < transitionPosition.length; i++) {
                                const a = positionAnimateFrom[i];
                                const b = positionAnimateTo[i];
                                transitionPosition[i] = (b - a) * p + a;
                            }
                            geo.attributes.position.needsUpdate = true;
                            app.render();

                            // 动画未完成时继续下一帧
                            if (progress < 1) {
                                buildingAnimators[cubefaces[idx]] = requestAnimationFrame(animate);
                            }
                        };

                        animate();
                    }, 1000);
                }
                else {
                    // 道路和水体不需要动画，直接应用最终位置
                    let finalPosition: Float32Array;
                    if (IS_TILE_STYLE) {
                        // 平铺模式：保持平面
                        finalPosition = poly.position;
                    }
                    else {
                        // 星球模式：应用球面变形
                        finalPosition = distortion(
                            poly.position, boundingRect,
                            config.radius, config.curveness, cubefaces[idx]
                        ) as Float32Array;
                    }
                    geo.setAttribute('position', new THREE.BufferAttribute(finalPosition, 3));
                    geo.computeVertexNormals();
                    geo.computeBoundingBox();
                }

                return {boundingRect: poly.boundingRect};
            }

            // 获取可见瓦片
            let tiles = mainLayer.getTiles().tileGrids[0].tiles;
            const subdomains = ['a', 'b', 'c'];
            
            // 最多加载6个瓦片（立方体6个面）
            let loading = Math.min(tiles.length, 6);
            tiles.forEach((tile, idx) => {
                const fetchId = this._id;
                if (idx >= 6) {
                    return;  // 只处理前6个瓦片
                }
                
                // 获取瓦片范围
                const extent = tile.extent2d.convertTo(c => map.pointToCoord(c)).toJSON();

                // 计算瓦片坐标缩放
                const scaleX = 1e4;
                const scaleY = scaleX * 1.4;
                const width = (extent.xmax - extent.xmin) * scaleX;
                const height = (extent.ymax - extent.ymin) * scaleY;
                
                // 瓦片矩形范围
                const tileRect = {
                    x: IS_TILE_STYLE ? -width / 2 : 0,
                    y: IS_TILE_STYLE ? -height / 2 : 0,
                    width: width,
                    height: height
                };
                
                // 累积边界矩形
                const allBoundingRect = {
                    x: Infinity,
                    y: Infinity,
                    width: -Infinity,
                    height: -Infinity
                };

                // 构建MVT瓦片URL
                const url = mvtUrlTpl.replace('{z}', String(tile.z))
                    .replace('{x}', String(tile.x))
                    .replace('{y}', String(tile.y))
                    .replace('{s}', subdomains[idx % 3]);

                // 检查缓存
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

                // 加载瓦片数据
                return fetch(url, {
                    mode: 'cors'
                }).then(response => response.arrayBuffer())
                    .then(buffer => {
                        // 检查请求是否已过期
                        if (fetchId !== this._id) {
                            return;
                        }

                        // 解析MVT数据
                        const pbf = new Protobuf(new Uint8Array(buffer));
                        const vTile = new VectorTile(pbf);
                        if (!vTile.layers.buildings) {
                            return;
                        }

                        // 提取各类要素
                        const features: Record<string, any[]> = {};
                        ['buildings', 'roads', 'water'].forEach(type => {
                            if (!vTile.layers[type]) {
                                return;
                            }
                            features[type] = [];
                            for (let i = 0; i < vTile.layers[type].length; i++) {
                                // 将MVT要素转换为GeoJSON
                                const feature = vTile.layers[type].feature(i).toGeoJSON(tile.x, tile.y, tile.z);
                                
                                // 缩放和平移坐标
                                scaleFeature(
                                    feature, 
                                    IS_TILE_STYLE
                                        ? [-(extent.xmax + extent.xmin) / 2, -(extent.ymax + extent.ymin) / 2]
                                        : [-extent.xmin, -extent.ymin],
                                    [scaleX, scaleY]
                                );
                                features[type].push(feature);
                            }

                            // 平铺模式下裁剪建筑物到可见范围
                            if (IS_TILE_STYLE && features[type]) {
                                cullBuildingPolygons(features[type], earthRect);
                            }
                        });

                        // 合并水体多边形（提高性能）
                        if (features.water) {
                            features.water = [unionComplexPolygons(features.water.filter((feature: any) => {
                                const geoType = feature.geometry && feature.geometry.type;
                                return geoType === 'Polygon' || geoType === 'MultiPolygon';
                            }))];
                        }
                        
                        // 过滤道路，只保留线要素
                        if (features.roads) {
                            features.roads = features.roads.filter((feature: any) => {
                                const geoType = feature.geometry && feature.geometry.type;
                                return geoType === 'LineString' || geoType === 'MultiLineString';
                            });
                        }

                        // 缓存处理后的要素
                        mvtCache.set(url, features);
                        
                        // 为每种要素创建网格
                        for (let key in features) {
                            const {boundingRect} = createElementMesh(
                                vectorElements.find(config => config.type === key),
                                features[key],
                                tileRect, idx
                            );
                            unionRect(allBoundingRect, boundingRect, allBoundingRect);
                        }

                        // 所有瓦片加载完成后更新地面
                        loading--;
                        if (IS_TILE_STYLE && loading === 0) {
                            app.methods.updateEarthGround.call(this, app, allBoundingRect);
                        }

                        // 重新渲染场景
                        if (app && app.methods && app.methods.render) {
                            app.methods.render.call(this, app);
                        }
                    });
            });
        },

        /**
         * 生成云朵
         * 使用QuickHull算法创建3D云朵形状
         */
        generateClouds(app) {
            if (!this._cloudsNode) {
                console.warn('generateClouds: _cloudsNode not initialized');
                return;
            }
            
            // 云朵数量（平铺模式较少）
            const cloudNumber = IS_TILE_STYLE ? 10 : 15;
            const pointCount = 100;  // 每个云朵的点数

            // 清除现有云朵
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

            // 创建云朵材质
            const cloudMaterial = app.createMaterial({
                roughness: 1,
                color: config.cloudColor
            });
            cloudMaterial.name = 'mat_cloud';

            /**
             * 在球体内生成随机点
             * @param r 球体半径
             */
            function randomInSphere(r: number): number[] {
                const alpha = Math.random() * Math.PI * 2;
                const beta = Math.random() * Math.PI;

                const r2 = Math.sin(beta) * r;
                const y = Math.cos(beta) * r;
                const x = Math.cos(alpha) * r2;
                const z = Math.sin(alpha) * r2;
                return [x, y, z];
            }
            
            // 生成多个云朵
            for (let i = 0; i < cloudNumber; i++) {
                const positionArr = new Float32Array(5 * pointCount * 3);
                let off = 0;
                let indices: number[] = [];

                // 云朵延伸方向
                let dx = Math.random() - 0.5;
                let dy = Math.random() - 0.5;
                const len = Math.sqrt(dx * dx + dy * dy);
                dx /= len; 
                dy /= len;

                const dist = 4 + Math.random() * 2;

                // 创建5个球形簇组成一个云朵
                for (let i = 0; i < 5; i++) {
                    const posOff = (i - 2) + (Math.random() * 0.4 - 0.2);
                    const rBase = 3 - Math.abs(posOff);
                    const points: number[][] = [];
                    const vertexOffset = off / 3;
                    
                    // 在球体内生成随机点
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
                    
                    // 使用QuickHull算法计算凸包
                    const tmp = quickhull(points);
                    for (let m = 0; m < tmp.length; m++) {
                        indices.push(tmp[m][0] + vertexOffset);
                        indices.push(tmp[m][1] + vertexOffset);
                        indices.push(tmp[m][2] + vertexOffset);
                    }
                }

                // 创建云朵几何体
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positionArr, 3));
                geo.setIndex(indices);
                geo.computeVertexNormals();

                // 创建云朵网格
                const cloudMesh = app.createMesh(geo, cloudMaterial, this._cloudsNode);
                (cloudMesh as any).height = Math.random() * 10 + 20;
                
                if (IS_TILE_STYLE) {
                    // 平铺模式：云朵在场景中随机分布
                    cloudMesh.position.set(
                        (Math.random() - 0.5) * 60,
                        Math.random() * 10 + 25,
                        (Math.random() - 0.5) * 60
                    );
                    cloudMesh.scale.set(0.6, 0.6, 0.6);
                }
                else {
                    // 星球模式：云朵围绕星球分布
                    const pos = randomInSphere(config.radius / Math.sqrt(2) + (cloudMesh as any).height);
                    cloudMesh.position.set(pos[0], pos[1], pos[2]);
                    cloudMesh.lookAt(0, 0, 0);  // 朝向星球中心
                }
            }
            
            if (app && app.methods && app.methods.render) {
                app.methods.render.call(this, app);
            }
        },

        /**
         * 更新颜色
         * 根据配置更新所有元素的颜色
         */
        updateColor() {
            // 更新地面颜色
            this._earthNode.children.forEach((mesh: any) => {
                if (mesh.material && mesh.material.color) {
                    mesh.material.color.set(config.earthColor);
                }
            });
            
            // 更新云朵颜色
            this._cloudsNode.children.forEach((mesh: any) => {
                if (mesh.material && mesh.material.color) {
                    mesh.material.color.set(config.cloudColor);
                }
            });
            
            // 更新元素颜色（建筑、道路、水体）
            for (let key in this._elementsMaterials) {
                const material = this._elementsMaterials[key];
                if (material && material.color) {
                    material.color.set(config[key + 'Color']);
                }
            }
            app.render();
        },

        /**
         * 渲染场景
         */
        render(app) {
            // 更新正交相机宽高比（如果需要）
            if (this._camera && this._camera instanceof THREE.OrthographicCamera) {
                const aspect = app.renderer.domElement.width / app.renderer.domElement.height;
            }
            app.render();
            // 延迟再次渲染以确保更新
            setTimeout(() => {
                app.render();
            }, 20);
        },

        /**
         * 更新自动旋转
         */
        updateAutoRotate() {
            this._control.rotateSpeed = config.rotateSpeed * 50;
            this._control.autoRotate = Math.abs(config.rotateSpeed) > 0.3;
        },

        /**
         * 更新天空可见性
         */
        updateSky(app) {
            // 控制背景可见性
            if (config.sky && this._skybox && this._skybox.texture) {
                // 显示渐变背景
                app.scene.background = this._skybox.texture;
                // 在星球模式下设置为环境贴图以提供反射
                if (!IS_TILE_STYLE) {
                    app.scene.environment = this._skybox.texture;
                }
            } else {
                // 隐藏背景
                app.scene.background = null;
            }
            app.render();
        },

        /**
         * 更新元素可见性
         */
        updateVisibility(app) {
            // 更新地面可见性
            if (this._earthNode) {
                this._earthNode.visible = config.showEarth;
            }
            
            // 更新云朵可见性
            if (this._cloudsNode) {
                this._cloudsNode.visible = config.showCloud;
            }

            // 更新各元素可见性
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

/**
 * =============================================================================
 * 全局更新函数
 * =============================================================================
 */

/**
 * 更新所有场景元素
 */
function updateAll() {
    if (!IS_TILE_STYLE) {
        app.methods.updateEarthSphere.call(app, app);
    }
    app.methods.updateElements.call(app, app);
}

/**
 * 更新URL状态（保存当前配置到URL）
 */
function updateUrlState() {
    history.pushState('', '', makeUrl(config, urlOpts));
}

/**
 * =============================================================================
 * 事件监听器设置
 * =============================================================================
 */

// 地图移动事件（延迟更新以避免频繁刷新）
let timeout: NodeJS.Timeout;
map.on('moveend', function () {
    clearTimeout(timeout);
    timeout = setTimeout(function () {
        app.methods.updateElements();
        updateUrlState();
    }, 500);
});

// 地图移动中更新坐标显示
map.on('moving', function () {
    const center = map.getCenter();
    urlOpts.lng = (document.querySelector('#lng') as HTMLInputElement)!.value = center.x;
    urlOpts.lat = (document.querySelector('#lat') as HTMLInputElement)!.value = center.y;
});

// 缩放结束事件
map.on('zoomend', function () {
    clearTimeout(timeout);
    timeout = setTimeout(function () {
        app.methods.updateElements();
    }, 500);
});

// 样式切换按钮
Array.prototype.forEach.call(document.querySelectorAll('#style-list li'), (li: HTMLElement) => {
    li.addEventListener('click', () => {
        urlOpts.style = li.className;
        (window.location as any) = makeUrl(config, urlOpts);
    });
});

// 设置位置控制按钮
setupLocationControls(map, urlOpts, app.methods.updateElements, updateUrlState, DEFAULT_LNG, DEFAULT_LAT);

/**
 * =============================================================================
 * UI控制面板初始化
 * =============================================================================
 */

const ui = createUIController(config, urlOpts, app, IS_TILE_STYLE, updateAll, updateUrlState);

/**
 * =============================================================================
 * 窗口大小变化处理
 * =============================================================================
 */

window.addEventListener('resize', () => { 
    if (app) {
        app.resize(); 
        if (app.methods && app.methods.render) {
            app.methods.render.call(app, app);
        }
    }
});
