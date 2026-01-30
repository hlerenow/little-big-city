/**
 * 矢量元素配置
 * 定义建筑、道路、水体等地图元素的配置
 */

/**
 * 矢量元素配置接口
 */
export interface VectorElementConfig {
    /** 元素类型：buildings/roads/water */
    type: string;
    /** 几何类型：polygon/polyline */
    geometryType: string;
    /** 挤压深度（可以是固定值或根据要素动态计算） */
    depth: number | ((feature: any) => number);
}

/**
 * 矢量元素配置列表
 */
export const vectorElements: VectorElementConfig[] = [
    {
        type: 'buildings',
        geometryType: 'polygon',
        /**
         * 根据建筑高度计算挤压深度
         * 公式：(height / 5) + 2
         * - 除以5：将真实高度（米）转换为场景单位
         * - +2：设置最小高度，确保所有建筑都可见
         */
        depth: (feature: any) => {
            const height = feature.properties.height || 30;
            return (height / 5) + 2;
        }
    },
    {
        type: 'roads',
        geometryType: 'polyline',
        depth: 1.2  // 道路固定深度
    },
    {
        type: 'water',
        geometryType: 'polygon',
        depth: 1  // 水体固定深度
    }
];

/**
 * 立方体面名称
 * 用于球面投影时的6个面
 */
export const cubefaces: string[] = [
    'pz', 'px', 'nz',
    'py', 'nx', 'ny'
];
