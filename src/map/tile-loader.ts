/**
 * 瓦片加载模块
 * 处理Mapbox Vector Tiles (MVT)的加载和解析
 */

import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { LRUCache } from 'lru-cache';
import { scaleFeature } from '../geometry/processors';

/**
 * MVT缓存（最多缓存50个瓦片）
 */
export const mvtCache = new LRUCache<string, any>({ max: 50 });

/**
 * 瓦片大小
 */
export const TILE_SIZE: number = 256;

/**
 * MVT URL模板
 */
export const mvtUrlTpl: string = `https://tile.nextzen.org/tilezen/vector/v1/${TILE_SIZE}/all/{z}/{x}/{y}.mvt?api_key=EWFsMD1DSEysLDWd2hj2cw`;

/**
 * 瓦片信息接口
 */
export interface TileInfo {
    x: number;
    y: number;
    z: number;
    extent: any;
}

/**
 * 加载并解析MVT瓦片
 * @param tile 瓦片信息
 * @param subdomain 子域名
 * @param isTileStyle 是否为平铺模式
 * @param scaleX X轴缩放系数
 * @param scaleY Y轴缩放系数
 */
export async function loadTile(
    tile: TileInfo,
    subdomain: string,
    isTileStyle: boolean,
    scaleX: number,
    scaleY: number
): Promise<Record<string, any[]>> {
    const url = mvtUrlTpl
        .replace('{z}', String(tile.z))
        .replace('{x}', String(tile.x))
        .replace('{y}', String(tile.y))
        .replace('{s}', subdomain);

    // 检查缓存
    if (mvtCache.get(url)) {
        return mvtCache.get(url)!;
    }

    // 获取瓦片数据
    const response = await fetch(url, { mode: 'cors' });
    const buffer = await response.arrayBuffer();
    const pbf = new Protobuf(new Uint8Array(buffer));
    const vTile = new VectorTile(pbf);

    if (!vTile.layers.buildings) {
        throw new Error('No buildings layer found in tile');
    }

    // 解析各类要素
    const features: Record<string, any[]> = {};
    ['buildings', 'roads', 'water'].forEach(type => {
        if (!vTile.layers[type]) {
            return;
        }
        features[type] = [];
        for (let i = 0; i < vTile.layers[type].length; i++) {
            const feature = vTile.layers[type].feature(i).toGeoJSON(tile.x, tile.y, tile.z);
            scaleFeature(
                feature,
                isTileStyle
                    ? [-(tile.extent.xmax + tile.extent.xmin) / 2, -(tile.extent.ymax + tile.extent.ymin) / 2]
                    : [-tile.extent.xmin, -tile.extent.ymin],
                [scaleX, scaleY]
            );
            features[type].push(feature);
        }
    });

    // 缓存结果
    mvtCache.set(url, features);
    return features;
}

/**
 * 过滤特征类型
 * @param features 特征数组
 * @param allowedTypes 允许的几何类型
 */
export function filterFeaturesByGeometryType(features: any[], allowedTypes: string[]): any[] {
    return features.filter((feature: any) => {
        const geoType = feature.geometry && feature.geometry.type;
        return allowedTypes.includes(geoType);
    });
}
