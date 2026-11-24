const assetRoot = 'https://raw.githubusercontent.com/Liuxingyu320/vice-coast/450f43b9ec33cc5d909169a15a889ace71b3ccc4/';
const vehicleDirectory = '模型/六辆街头载具-GLB/';

export const streetVehicleFiles = {
  streetVan: vehicleDirectory + '老式市井面包车.glb',
  streetBike: vehicleDirectory + '破旧跨骑摩托车.glb',
  streetScooter: vehicleDirectory + '外卖配送电动车.glb',
  streetEbike: vehicleDirectory + '共享电驴.glb',
  streetStall: vehicleDirectory + '夜市三轮烧烤餐车.glb',
  patrol: vehicleDirectory + '都市街头巡逻警车.glb',
};

export class ModelDownloadError extends Error {
  constructor(path, cause) {
    super('Could not download model: ' + path, { cause });
  }
}

const pending = new Map();

export function loadModel(path) {
  if (!pending.has(path)) {
    const url = assetRoot + path.split('/').map(encodeURIComponent).join('/');
    const signal = globalThis.AbortSignal?.timeout?.(240_000);
    const task = fetch(url, { signal })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.arrayBuffer();
      })
      .catch((cause) => {
        throw new ModelDownloadError(path, cause);
      })
      .finally(() => pending.delete(path));
    pending.set(path, task);
  }
  return pending.get(path);
}
