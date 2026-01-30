/**
 * 应用配置模块
 * 包含默认配置、URL参数解析和配置管理
 */

/**
 * 配置接口定义
 */
export interface Config {
    /** 球体半径 */
    radius: number;
    /** 曲率系数 */
    curveness: number;
    /** 是否显示地面 */
    showEarth: boolean;
    /** 地面深度 */
    earthDepth: number;
    /** 地面颜色 */
    earthColor: string;
    /** 是否显示建筑 */
    showBuildings: boolean;
    /** 建筑颜色 */
    buildingsColor: string;
    /** 是否显示道路 */
    showRoads: boolean;
    /** 道路颜色 */
    roadsColor: string;
    /** 是否显示水体 */
    showWater: boolean;
    /** 水体颜色 */
    waterColor: string;
    /** 是否显示云朵 */
    showCloud: boolean;
    /** 云朵颜色 */
    cloudColor: string;
    /** 自动旋转速度 */
    rotateSpeed: number;
    /** 是否显示天空 */
    sky: boolean;
}

/**
 * URL选项接口
 */
export interface UrlOpts {
    lng?: number;
    lat?: number;
    style?: string;
    config?: string;
    [key: string]: string | number | boolean | undefined;
}

/** 默认经度 - 平潭岛（福建省） */
export const DEFAULT_LNG: number = 119.791;
/** 默认纬度 - 平潭岛（福建省） */
export const DEFAULT_LAT: number = 25.503;

/** 默认配置 */
export const DEFAULT_CONFIG: Config = {
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

/**
 * 从URL解析参数
 */
export function parseUrlParams(): UrlOpts {
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
    
    return urlOpts;
}

/**
 * 从URL加载配置
 */
export function loadConfigFromUrl(urlOpts: UrlOpts): Config {
    const config: Config = Object.assign({}, DEFAULT_CONFIG);
    try {
        Object.assign(config, JSON.parse(decodeURIComponent(urlOpts.config || '{}')));
    } catch (e) {
        console.warn('Failed to parse config from URL:', e);
    }
    return config;
}

/**
 * 生成URL（包含当前配置）
 */
export function makeUrl(config: Config, urlOpts: UrlOpts): string {
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
