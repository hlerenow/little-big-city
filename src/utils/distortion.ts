/**
 * 几何变形工具
 * 
 * 功能说明：
 * - 将平面几何投影到球面上
 * - 支持立方体6个面的不同投影方向
 * - 用于创建星球模式的曲面效果
 * 
 * @module utils/distortion
 */

/**
 * 边界矩形接口
 */
interface BoundingRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 立方体面类型
 * pz: 正Z面, px: 正X面, nz: 负Z面, py: 正Y面, nx: 负X面, ny: 负Y面
 */
type Face = 'pz' | 'px' | 'nz' | 'py' | 'nx' | 'ny' | string;

/**
 * 向量归一化
 * @param v 三维向量 [x, y, z]
 */
function normalize(v: number[]): void {
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
}

/**
 * 对几何体进行球面投影变形
 * 
 * @param position 顶点位置数组（按xyz顺序排列）
 * @param boundingRect 几何体的边界矩形
 * @param size 球体尺寸
 * @param curveness 曲率系数（1=完全球形，0=平面）
 * @param face 投影到立方体的哪个面
 * @returns 变形后的顶点位置数组
 */
export default function distortion(
    position: Float32Array | number[],
    boundingRect: BoundingRect,
    size: number,
    curveness: number,
    face: Face
): Float32Array | number[] {
    const vec = [];
    const fullRadius = size / Math.sqrt(2);
    const radius = fullRadius / curveness;
    for (let i = 0; i < position.length; i += 3) {
        const x = position[i];
        const y = position[i + 1];
        const z = position[i + 2];

        let u = (x - boundingRect.x) / boundingRect.width * 2 - 1;
        let v = (y - boundingRect.y) / boundingRect.height * 2 - 1;

        u *= curveness;
        v *= curveness;

        const r = z + radius;
        const off = radius - fullRadius;
        switch (face) {
            case 'pz':
                vec[0] = u;
                vec[1] = v;
                vec[2] = 1;
                normalize(vec);
                position[i] = vec[0] * r;
                position[i + 1] = vec[1] * r;
                position[i + 2] = -off + vec[2] * r;
                break;
            case 'px':
                vec[0] = 1;
                vec[1] = v;
                vec[2] = -u;
                normalize(vec);
                position[i] = -off + vec[0] * r;
                position[i + 1] = vec[1] * r;
                position[i + 2] = vec[2] * r;
                break;
            case 'nz':
                vec[0] = -u;
                vec[1] = v;
                vec[2] = -1;
                normalize(vec);
                position[i] = vec[0] * r;
                position[i + 1] = vec[1] * r;
                position[i + 2] = off + vec[2] * r;
                break;
            case 'py':
                vec[0] = -u;
                vec[1] = 1;
                vec[2] = v;
                normalize(vec);
                position[i] = vec[0] * r;
                position[i + 1] = -off + vec[1] * r;
                position[i + 2] = vec[2] * r;
                break;
            case 'nx':
                vec[0] = -1;
                vec[1] = -u;
                vec[2] = v;
                normalize(vec);
                position[i] = off + vec[0] * r;
                position[i + 1] = vec[1] * r;
                position[i + 2] = vec[2] * r;
                break;
            case 'ny':
                vec[0] = u;
                vec[1] = -1;
                vec[2] = v;
                normalize(vec);
                position[i] = vec[0] * r;
                position[i + 1] = off + vec[1] * r;
                position[i + 2] = vec[2] * r;
                break;
        }
    }

    return position;
}
