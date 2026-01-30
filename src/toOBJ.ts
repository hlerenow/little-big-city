import { Vector3 } from 'claygl';

const CREDIT = '# https://github.com/pissang/little-big-city\n';

interface ExportOptions {
    mtllib?: string;
    storeVertexColorInTexture?: boolean;
}

interface ExportResult {
    obj: string;
    mtl: string;
}

function quantizeArr(out: number[], arr: number[], precision: number): void {
    out[0] = Math.round(arr[0] * precision) / precision;
    out[1] = Math.round(arr[1] * precision) / precision;
    if (arr.length > 2) {
        out[2] = Math.round(arr[2] * precision) / precision;
    }
}

function phongFromRoughness(r?: number): number {
    if (r == null) {
        r = 1;
    }
    return Math.pow(1000.0, 1 - r);
}

function getMaterialParameters(material: any): Record<string, any> {
    const obj: Record<string, any> = {};
    obj['Kd'] = (material.get('color') || [1, 1, 1]).slice(0, 3).join(' ');
    // TODO
    obj['Ks'] = [1, 1, 1].join(' ');
    obj['Ns'] = phongFromRoughness(material.get('roughness'));

    // Physically-based Rendering extension.
    if (material.shader.name === 'ecgl.realistic') {
        if (material.get('metalness') != null) {
            obj['Pm'] = material.get('metalness');
        }
        if (material.get('roughness') != null) {
            obj['Pr'] = material.get('roughness');
        }
    }
    return obj;
}

/**
 * Export ClayGL scene to OBJ format
 */
export default function exportGL2OBJ(scene: any, opts?: ExportOptions): ExportResult {
    opts = opts || {};
    opts.storeVertexColorInTexture = opts.storeVertexColorInTexture || false;
    opts.mtllib = opts.mtllib || 'material';

    let objStr = CREDIT;
    objStr += 'mtllib ' + opts.mtllib + '.mtl\n';

    const materialLib: Record<string, any> = {};
    const textureLib: Record<string, any> = {};
    let indexStart = 1;
    scene.traverse(function (mesh: any) {
        let parent = mesh;
        while (parent) {
            if (parent.invisible) {
                return;
            }
            parent = parent.getParent();
        }

        if (mesh.isRenderable() && mesh.geometry.vertexCount) {
            let materialName = mesh.material.name;
            objStr += 'o ' + mesh.name + '\n';

            materialLib[materialName] = getMaterialParameters(mesh.material);

            const vStr: string[] = [];
            const vtStr: string[] = [];
            const vnStr: string[] = [];

            let geometry = mesh.geometry;
            let positionAttr = geometry.attributes.position;
            let colorAttr = geometry.attributes.color;
            let normalAttr = geometry.attributes.normal;
            let texcoordAttr = geometry.attributes.texcoord0;

            mesh.updateWorldTransform();
            const normalMat = mesh.worldTransform.clone().invert().transpose();

            const pos = new Vector3();
            const nor = new Vector3();
            const col: number[] = [];
            const uv: number[] = [];

            const hasTexcoord = !!(texcoordAttr && texcoordAttr.value);
            const hasNormal = !!(normalAttr && normalAttr.value);
            const hasColor = !!(colorAttr && colorAttr.value);

            const tmp: number[] = [];
            for (let i = 0; i < geometry.vertexCount; i++) {
                positionAttr.get(i, pos.array);

                Vector3.transformMat4(pos, pos, mesh.worldTransform);

                // PENDING
                quantizeArr(tmp, pos.array as number[], 1e5);
                let vItem = 'v ' + tmp.join(' ');
                if (hasColor && !opts.storeVertexColorInTexture) {
                    colorAttr.get(i, col);
                    quantizeArr(col, col, 1e3);
                    vItem += ' ' + col.join(' ');
                }
                vStr.push(vItem);

                if (hasNormal) {
                    normalAttr.get(i, nor.array);
                    Vector3.transformMat4(nor, nor, normalMat);
                    Vector3.normalize(nor, nor);
                    quantizeArr(tmp, nor.array as number[], 1e3);
                    vnStr.push('vn ' + tmp.join(' '));
                }
                else {
                    vnStr.push('vn 0 0 0');
                }
                if (hasTexcoord) {
                    texcoordAttr.get(i, uv);
                    quantizeArr(uv, uv, 1e5);
                    vtStr.push('vt ' + uv.join(' '));
                }
                else {
                    vtStr.push('vt 0 0');
                }
            }

            const fStr: string[] = [];
            const indices: any[] = [];
            for (let i = 0; i < geometry.triangleCount; i++) {
                geometry.getTriangleIndices(i, indices);
                // Start from 1
                for (let k = 0; k < 3; k++) {
                    indices[k] += indexStart;
                    var idx = indices[k];
                    // if (hasTexcoord) {
                        indices[k] += '/' + idx;
                    // }
                    // if (hasNormal) {
                    //     if (!hasTexcoord) {
                    //         indices[k] += '/';
                    //     }
                        indices[k] += '/' + idx;
                    // }
                }

                fStr.push('f ' + indices.join(' '));
            }

            objStr += vStr.join('\n') + '\n'
                + vnStr.join('\n') + '\n'
                + vtStr.join('\n') + '\n'
                + 'usemtl ' + materialName + '\n'
                + fStr.join('\n') + '\n';

            indexStart += geometry.vertexCount;
        }
    });

    const mtlStr: string[] = [
        CREDIT
    ];
    for (const matName in materialLib) {
        const material = materialLib[matName];
        mtlStr.push('newmtl ' + matName);
        for (const key in material) {
            const val = material[key];
            mtlStr.push(key + ' ' + val);
        }
    }

    return {
        obj: objStr,
        mtl: mtlStr.join('\n')
    };
};