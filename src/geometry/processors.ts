/**
 * 几何处理工具函数
 * 包含坐标处理、边缘细分、特征缩放等功能
 */

import * as THREE from 'three';
import PolyBool from 'polybooljs';

/**
 * 矩形接口
 */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 获取矩形的坐标数组
 */
export function getRectCoords(rect: Rect): number[][] {
    return [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x + rect.width, rect.y + rect.height],
        [rect.x, rect.y + rect.height],
        [rect.x, rect.y]
    ];
}

/**
 * 合并两个矩形
 */
export function unionRect(out: Rect, a: Rect, b: Rect): void {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    out.x = x;
    out.y = y;
    out.width = Math.max(a.width + a.x, b.width + b.x) - x;
    out.height = Math.max(a.height + a.y, b.height + b.y) - y;
}

/**
 * 迭代特征的坐标
 * @param feature GeoJSON特征
 * @param cb 回调函数，对每组坐标进行处理
 */
export function iterateFeatureCoordinates(feature: any, cb: (coords: any) => any): void {
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

/**
 * 细分长边
 * 将长边分割成多个较短的段，用于更好的几何变形效果
 * @param features 特征数组
 * @param maxDist 最大距离
 */
export function subdivideLongEdges(features: any[], maxDist: number): void {
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

/**
 * 缩放特征坐标
 * @param feature GeoJSON特征
 * @param offset 偏移量 [x, y]
 * @param scale 缩放比例 [x, y]
 */
export function scaleFeature(feature: any, offset: number[], scale: number[]): void {
    function scalePoints(pts: any[]): any[] {
        for (let i = 0; i < pts.length; i++) {
            pts[i][0] = (pts[i][0] + offset[0]) * scale[0];
            pts[i][1] = (pts[i][1] + offset[1]) * scale[1];
        }
        return pts;
    }
    iterateFeatureCoordinates(feature, scalePoints);
}

/**
 * 合并复杂多边形
 * 使用PolyBool库合并多个多边形为一个
 * @param features 特征数组
 */
export function unionComplexPolygons(features: any[]): any {
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

/**
 * 裁剪建筑多边形到指定矩形范围内
 * @param features 特征数组
 * @param earthRect 裁剪矩形
 */
export function cullBuildingPolygons(features: any[], earthRect: Rect): void {
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
