import {Collection, getModelCollections, getModelId, getModelType, Model, modelToJSON} from 'datx';
import {META_FIELD} from 'datx/dist/consts';
import {mapItems} from 'datx/dist/helpers/utils';
import {IRawModel} from 'datx/dist/interfaces/IRawModel';
import {storage} from 'datx/dist/services/storage';

import {MODEL_LINKS_FIELD, MODEL_META_FIELD, MODEL_PERSISTED_FIELD} from '../consts';
import {IDictionary} from '../interfaces/IDictionary';
import {IJsonapiCollection} from '../interfaces/IJsonapiCollection';
import {IJsonapiModel} from '../interfaces/IJsonapiModel';
import {IRequestOptions} from '../interfaces/IRequestOptions';
import {IDefinition, ILink, IRecord, IRelationship} from '../interfaces/JsonApi';
import {config, create, handleResponse, update} from '../NetworkUtils';
import {getValue} from './utils';

export function flattenModel(): null;
export function flattenModel(data?: IRecord): IRawModel;
export function flattenModel(data?: IRecord): IRawModel|null {
  if (!data) {
    return null;
  }

  const rawData = {
    [META_FIELD]: {
      id: data.id,
      [MODEL_LINKS_FIELD]: data.links,
      [MODEL_META_FIELD]: data.meta,
      [MODEL_PERSISTED_FIELD]: Boolean(data.id),
      type: data.type,
    },
  };

  if (data.relationships) {
    Object.keys(data.relationships).forEach((key) => {
      const ref = (data.relationships as IDictionary<IRelationship>)[key] as IRelationship;
      rawData[key] = mapItems(ref.data, (item: IDefinition) => item.id);
    });
  }

  return Object.assign(rawData, data.attributes);
}

export function getModelMeta(model: IJsonapiModel): IDictionary<any> {
  return storage.getModelMetaKey(model, MODEL_META_FIELD);
}

export function getModelLinks(model: IJsonapiModel): IDictionary<ILink> {
  return storage.getModelMetaKey(model, MODEL_LINKS_FIELD);
}

function isModelPersisted(model: IJsonapiModel): boolean {
  return storage.getModelMetaKey(model, MODEL_PERSISTED_FIELD);
}

export function modelToJsonApi(model: IJsonapiModel): IRecord {
  const staticModel = model.constructor as typeof Model;
  const attributes: IDictionary<any> = modelToJSON(model);

  const useAutogenerated: boolean = staticModel['useAutogeneratedIds'];
  const isPersisted = isModelPersisted(model);

  const data: IRecord = {
    attributes,
    id: (isPersisted || useAutogenerated) ? getModelId(model) : undefined,
    type: getModelType(model) as string,
  };

  const refs = storage.getModelMetaKey(model, 'refs');

  Object.keys(refs).forEach((key) => {
    data.relationships = data.relationships || {};
    const rel = mapItems(model[key], (item: Model) => {
      const id = getModelId(item);
      const type = getModelType(item);
      return {id, type};
    });

    data.relationships[key] = {data: rel} as IRelationship;
    delete data.attributes[key];
  });

  return data;
}

function getModelEndpointUrl(model: IJsonapiModel): string {
  const staticModel = model.constructor as Model;
  const links: IDictionary<ILink> = getModelLinks(model);
  if (links && links.self) {
    const self: ILink = links.self;
    return typeof self === 'string' ? self : self.href;
  }

  const url = getValue<string>(staticModel['endpoint']) || getModelType(model);

  return isModelPersisted(model)
    ? `${config.baseUrl}${url}/${getModelId(model)}`
    : `${config.baseUrl}${url}`;
}

export function saveModel(model: IJsonapiModel, options?: IRequestOptions): Promise<IJsonapiModel> {
  const collection: IJsonapiCollection = getModelCollections(model)[0] as IJsonapiCollection;

  const data: IRecord = modelToJsonApi(model);
  const requestMethod = isModelPersisted(model) ? update : create;
  const url = getModelEndpointUrl(model);
  return requestMethod(collection, url, {data}, options && options.headers)
    .then(handleResponse(model));
}
