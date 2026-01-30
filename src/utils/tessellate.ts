/**
 * 几何体细分工具
 * 
 * 功能说明：
 * - 将大三角形细分为多个小三角形
 * - 用于提高几何变形的精度和平滑度
 * - 特别适用于需要曲面变形的大面片
 * 
 * 已迁移到Three.js Vector3 API ✅
 * 
 * @module utils/tessellate
 */

import * as THREE from 'three';

/**
 * 细分结果接口
 */
interface TessellateResult {
    /** 细分后的顶点位置 */
    position: Float32Array;
    /** 细分后的索引 */
    indices: Uint16Array | Uint32Array;
}

/**
 * 对几何体进行自适应细分
 * 
 * @param position 原始顶点位置数组
 * @param indices 原始索引数组
 * @param tolerance 细分容差（边长大于此值时进行细分）
 * @returns 细分后的几何体数据
 */
export default function tesselate(
    position: Float32Array,
    indices: Uint16Array | Uint32Array,
    tolerance: number
): TessellateResult {
    // 创建Three.js Vector3实例用于计算
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const p3 = new THREE.Vector3();

    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const e3 = new THREE.Vector3();

    const ee = new THREE.Vector3();

    const appendPosition: number[] = [];
    const appendIndices: number[] = [];

    let vtxOff = position.length / 3;

    const vtxMap: Record<string, number> = {};
    
    /**
     * 添加顶点到细分结果中
     * 使用坐标哈希去重，避免重复顶点
     */
    function addPoint(
        pt: THREE.Vector3,
        p1: THREE.Vector3,
        p2: THREE.Vector3,
        p3: THREE.Vector3,
        i1: number,
        i2: number,
        i3: number
    ): number {
        // 如果是原始顶点，直接返回索引
        if (pt === p1) { return i1; }
        else if (pt === p2) { return i2; }
        else if (pt === p3) { return i3; }

        // 使用坐标生成哈希键
        const x = Math.round(pt.x * 100);
        const y = Math.round(pt.y * 100);
        const z = Math.round(pt.z * 100);
        const key = x + '-' + y + '-' + z;
        
        // 检查是否已存在相同坐标的顶点
        if (vtxMap[key] != null) {
            return vtxMap[key];
        }

        // 添加新顶点
        appendPosition.push(pt.x);
        appendPosition.push(pt.y);
        appendPosition.push(pt.z);

        vtxMap[key] = vtxOff;

        return vtxOff++;
    }

    /**
     * 添加三角形索引
     */
    function addIndices(i1: number, i2: number, i3: number): void {
        appendIndices.push(i1);
        appendIndices.push(i2);
        appendIndices.push(i3);
    }

    // 遍历所有三角形
    for (let f = 0; f < indices.length;) {
        const i1 = indices[f++];
        const i2 = indices[f++];
        const i3 = indices[f++];

        // 设置三角形三个顶点的位置
        p1.set(position[i1 * 3], position[i1 * 3 + 1], position[i1 * 3 + 2]);
        p2.set(position[i2 * 3], position[i2 * 3 + 1], position[i2 * 3 + 2]);
        p3.set(position[i3 * 3], position[i3 * 3 + 1], position[i3 * 3 + 2]);

        // 只处理Z坐标都为正的三角形（在表面上的三角形）
        if (p1.z > 0 && p2.z > 0 && p3.z > 0) {
            // 计算三角形的三条边
            e1.subVectors(p1, p2);
            e2.subVectors(p3, p2);
            e3.subVectors(p3, p1);
            
            // 计算边长
            const l1 = e1.length();
            const l2 = e2.length();
            const l3 = e3.length();

            // 如果所有边都小于容差，不需要细分
            if (l1 <= tolerance && l2 <= tolerance && l3 <= tolerance) {
                continue;
            }

            // 归一化边向量
            e1.normalize();
            e2.normalize();

            // 沿着边e1（p2->p1）生成点
            let e1Points: THREE.Vector3[] = [p2];
            let step = l1 / Math.floor(l1 / tolerance);
            for (let d = step; d < l1; d += step) {
                const pt = new THREE.Vector3().copy(p2).addScaledVector(e1, d);
                e1Points.push(pt);
            }
            e1Points.push(p1);

            // 沿着边e2（p2->p3）生成点
            let e2Points: THREE.Vector3[] = [p2];
            step = l2 / Math.floor(l2 / tolerance);
            for (let d = step; d < l2; d += step) {
                const pt = new THREE.Vector3().copy(p2).addScaledVector(e2, d);
                e2Points.push(pt);
            }
            e2Points.push(p3);

            const len1 = e1Points.length;
            const len2 = e2Points.length;

            // 生成三角形网格
            let lastEdgeIndices: number[] = [i2];
            for (let i = 1; i < Math.max(len1, len2); i++) {
                const ii = Math.min(len1 - 1, i);
                const ik = Math.min(len2 - 1, i);
                const p11 = e1Points[ii];
                const p12 = e2Points[ik];

                // 计算横向边
                ee.subVectors(p12, p11);
                const lee = ee.length();
                ee.normalize();

                // 沿着横向边生成点
                const edgeIndices: number[] = [];
                edgeIndices.push(addPoint(p11, p1, p2, p3, i1, i2, i3));
                let step = lee / Math.floor(lee / tolerance);
                for (let d = step; d < lee; d += step) {
                    const pt = new THREE.Vector3().copy(p11).addScaledVector(ee, d);
                    edgeIndices.push(addPoint(pt, p1, p2, p3, i1, i2, i3));
                }
                edgeIndices.push(addPoint(p12, p1, p2, p3, i1, i2, i3));

                // 生成三角形
                const lastEdgeMax = lastEdgeIndices.length - 1;
                for (let m = 0; m < edgeIndices.length - 1; m++) {
                    const m2 = m + 1;
                    const n = Math.min(lastEdgeMax, m);
                    const n2 = Math.min(lastEdgeMax, m2);
                    addIndices(edgeIndices[m], lastEdgeIndices[n], edgeIndices[m2]);
                    if (n !== n2) {
                        addIndices(lastEdgeIndices[n], lastEdgeIndices[n2], edgeIndices[m2]);
                    }
                }

                lastEdgeIndices = edgeIndices;
            }
        }
    }

    // 如果有新增的顶点，合并原始数据和新数据
    if (appendPosition.length) {
        const newPosition = new Float32Array(position.length + appendPosition.length);
        const newIndices = new (newPosition.length / 3 > 0xffff ? Uint32Array : Uint16Array)(
            indices.length + appendIndices.length
        );

        // 复制原始顶点位置
        newPosition.set(position);
        newPosition.set(appendPosition, position.length);

        // 复制原始索引和新索引
        newIndices.set(indices);
        newIndices.set(appendIndices, indices.length);

        return { position: newPosition, indices: newIndices };
    }
    
    // 没有细分，返回原始数据
    return { position, indices };
}