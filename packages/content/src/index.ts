import {
  Analogs, ChannelMap, EngineConfig, EventTypeDef, GeoConfig, HistoricalCountry, IndicatorConfigs, Priors, ScheduledEvent, Transition,
  type IndicatorConfig,
} from '@ripple/schema';
import { z } from 'zod';
import eventTypesJson from '../catalog/event-types.json';
import channelsJson from '../catalog/channels.json';
import indicatorsJson from '../config/indicators.json';
import engineJson from '../config/engine.json';
import geoJson from '../config/geo.json';
import priorsJson from '../priors/indicators.json';
import historicalJson from '../historical-countries.json';
import analogsJson from '../analogs.json';
import transitionsJson from '../transitions.json';
import tierAJson from '../events/tier-a.json';

export interface Content {
  eventTypes: EventTypeDef[];
  channels: ChannelMap;
  indicatorConfig: Record<string, IndicatorConfig>;
  engine: EngineConfig;
  geo: GeoConfig;
  priors: Priors;
  historicalCountries: HistoricalCountry[];
  analogs: Analogs;
  transitions: Transition[];
  events: ScheduledEvent[];
}

let cached: Content | undefined;

export function loadContent(): Content {
  if (cached) return cached;
  cached = {
    eventTypes: z.array(EventTypeDef).parse(eventTypesJson),
    channels: ChannelMap.parse(channelsJson),
    indicatorConfig: IndicatorConfigs.parse(indicatorsJson),
    engine: EngineConfig.parse(engineJson),
    geo: GeoConfig.parse(geoJson),
    priors: Priors.parse(priorsJson),
    historicalCountries: z.array(HistoricalCountry).parse(historicalJson),
    analogs: Analogs.parse(analogsJson),
    transitions: z.array(Transition).parse(transitionsJson),
    events: z.array(ScheduledEvent).parse(tierAJson),
  };
  return cached;
}
