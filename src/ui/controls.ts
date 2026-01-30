/**
 * UI控制模块
 * 处理dat.GUI界面创建和用户交互
 */

import * as dat from 'dat.gui';
import { Config, makeUrl, UrlOpts, DEFAULT_CONFIG } from '../core/config';
import toOBJ from '../exporters/toOBJ';
import JSZip from 'jszip';

// 声明全局saveAs函数（来自FileSaver.js）
declare const saveAs: (data: Blob, filename: string) => void;

/**
 * UI控制器接口
 */
export interface UIActions {
    /** 下载OBJ模型 */
    downloadOBJ: () => void;
    /** 随机生成云朵 */
    randomCloud: () => void;
    /** 重置为默认配置 */
    reset: () => void;
}

/**
 * 创建UI控制器
 */
export function createUIController(
    config: Config,
    urlOpts: UrlOpts,
    app: any,
    isTileStyle: boolean,
    updateAll: () => void,
    updateUrlState: () => void
): dat.GUI {
    // 定义操作
    const actions: UIActions = {
        downloadOBJ: createDownloadAction(app),
        randomCloud: () => {
            app.methods.generateClouds();
        },
        reset: () => {
            Object.assign(config, DEFAULT_CONFIG);
            ui.updateDisplay();
            (window.location as any) = makeUrl(config, urlOpts);
        }
    };

    // 创建GUI
    const ui = new dat.GUI();
    
    // 主控制
    ui.add(actions, 'reset');
    if (!isTileStyle) {
        ui.add(config, 'radius', 30, 100).step(1).onChange(updateAll).onFinishChange(updateUrlState);
    }
    ui.add(config, 'rotateSpeed', -2, 2).step(0.01).onChange(app.methods.updateAutoRotate).onFinishChange(updateUrlState);
    ui.add(config, 'sky').onChange(app.methods.updateSky).onFinishChange(updateUrlState);

    // 地面控制
    const earthFolder = ui.addFolder('Earth');
    earthFolder.add(config, 'showEarth').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
    if (isTileStyle) {
        earthFolder.add(config, 'earthDepth', 1, 50).onChange(() => {
            app.methods.updateEarthGround.call(app, app, config.earthDepth);
        }).onFinishChange(updateUrlState);
    }
    earthFolder.addColor(config, 'earthColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

    // 建筑控制
    const buildingsFolder = ui.addFolder('Buildings');
    buildingsFolder.add(config, 'showBuildings').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
    buildingsFolder.addColor(config, 'buildingsColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

    // 道路控制
    const roadsFolder = ui.addFolder('Roads');
    roadsFolder.add(config, 'showRoads').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
    roadsFolder.addColor(config, 'roadsColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

    // 水体控制
    const waterFolder = ui.addFolder('Water');
    waterFolder.add(config, 'showWater').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
    waterFolder.addColor(config, 'waterColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);

    // 云朵控制
    const cloudFolder = ui.addFolder('Cloud');
    cloudFolder.add(config, 'showCloud').onChange(app.methods.updateVisibility).onFinishChange(updateUrlState);
    cloudFolder.addColor(config, 'cloudColor').onChange(app.methods.updateColor).onFinishChange(updateUrlState);
    cloudFolder.add(actions, 'randomCloud');

    // 导出控制
    ui.add(actions, 'downloadOBJ');

    return ui;
}

/**
 * 创建下载OBJ的操作
 */
function createDownloadAction(app: any): () => void {
    let downloading = false;
    return () => {
        if (downloading) {
            return;
        }
        downloading = true;
        
        try {
            const { obj, mtl } = toOBJ(app.scene, {
                mtllib: 'city'
            });
            const zip = new JSZip();
            zip.file('city.obj', obj);
            zip.file('city.mtl', mtl);
            zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
                .then((content: Blob) => {
                    saveAs(content, 'city.zip');
                    downloading = false;
                })
                .catch((e: any) => {
                    console.error('Failed to generate ZIP:', e.toString());
                    downloading = false;
                });
        } catch (e) {
            console.error('Failed to export OBJ:', e);
            downloading = false;
        }
    };
}

/**
 * 设置地图位置输入框事件
 */
export function setupLocationControls(
    map: any,
    urlOpts: UrlOpts,
    updateElements: () => void,
    updateUrlState: () => void,
    DEFAULT_LNG: number,
    DEFAULT_LAT: number
): void {
    // 定位按钮
    document.querySelector('#locate')?.addEventListener('click', () => {
        urlOpts.lng = +(document.querySelector('#lng') as HTMLInputElement)!.value;
        urlOpts.lat = +(document.querySelector('#lat') as HTMLInputElement)!.value;
        map.setCenter({ x: urlOpts.lng, y: urlOpts.lat });
        updateElements();
        updateUrlState();
    });

    // 重置位置按钮
    document.querySelector('#reset')?.addEventListener('click', () => {
        urlOpts.lng = (document.querySelector('#lng') as HTMLInputElement)!.value = DEFAULT_LNG as any;
        urlOpts.lat = (document.querySelector('#lat') as HTMLInputElement)!.value = DEFAULT_LAT as any;
        map.setCenter({ x: urlOpts.lng, y: urlOpts.lat });
        updateElements();
        updateUrlState();
    });
}
