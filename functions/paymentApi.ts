/**
 * API-слой для работы с зависимыми списками параметров оплаты.
 *
 * Архитектура:
 *  - Список 37 «Зависимые списки: Настройки» — конфигурация каскада
 *    (условия IF_ELEM, варианты VARIANTY, поля UF_CRM_*).
 *  - Список 39 «Зависимые списки: Списки» — справочник всех значений
 *    (Способы оплаты, Кому выставляем счет, НДС в счете).
 *
 * Всё работает через BX24.callMethod / BX24.callBatch, доступных в
 * окружении приложения Bitrix24.
 */

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface ListSection {
  ID: string;
  NAME: string;
  IBLOCK_SECTION_ID: string | null;
  DEPTH_LEVEL: string;
}

export interface ListElement {
  ID: string;
  NAME: string;
  IBLOCK_SECTION_ID: string | null;
  /** Значение свойства PROPERTY_212 (рекомендация), если есть */
  recommendation?: string;
}

/** Элемент конфигурации каскада (список 37). */
export interface SettingsElement {
  ID: string;
  NAME: string;
  /** 'Настройка в сущности' (58) или 'Уровень списка' (59) */
  typeId: string | null;
  /** Уровень, например '1.1', '0' */
  level: string | null;
  /** Условие: ID элемента из списка 39 (IF_ELEM / PROPERTY_213) */
  ifElementIds: string[];
  /** Показываемые варианты (PROPERTY_208 «Показать») */
  showOptionIds: string[];
  /** Дочерние конфигурации (PROPERTY_215 «Варианты») */
  variantIds: string[];
  /** Поле UF_CRM_*, куда пишется значение */
  ufField: string | null;
  /** Раздел уровня (PROPERTY_214) */
  sectionId: string | null;
}

// ---------------------------------------------------------------------------
// Константы (можно править без изменения остального кода)
// ---------------------------------------------------------------------------

/** ID списка конфигурации каскада («Зависимые списки: Настройки»). */
export const SETTINGS_IBLOCK_ID = 37;

/** ID списка справочника значений («Зависимые списки: Списки»). */
export const OPTIONS_IBLOCK_ID = 39;

/** Тип элемента списка 37: «Настройка в сущности» (значение PROPERTY_209). */
export const TYPE_SETTING = '58';

/** Тип элемента списка 37: «Уровень списка» (значение PROPERTY_209). */
export const TYPE_LEVEL = '59';

// ---------------------------------------------------------------------------
// Низкоуровневые обёртки над BX24 / REST-вебхуком
// ---------------------------------------------------------------------------

/**
 * Базовый URL вебхука Bitrix24 (для работы вне BX24-окружения).
 * Задаётся в .env как VITE_B24_WEBHOOK_URL.
 */
const WEBHOOK_URL = (import.meta.env?.VITE_B24_WEBHOOK_URL as string) || '';

/** Публичная BX24-обёртка: доступна только внутри Bitrix24. */
declare const BX24: any;

function callMethod<T = any>(method: string, params: object): Promise<T> {
  // Внутри Bitrix24 используем нативный BX24
  if (typeof BX24 !== 'undefined') {
    return new Promise((resolve, reject) => {
      BX24.callMethod(method, params, (result: any) => {
        if (result.error()) {
          reject(result.error());
        } else {
          resolve(result.data() as T);
        }
      });
    });
  }

  // Вне Bitrix24 — используем REST-вебхук
  if (WEBHOOK_URL) {
    return fetchWebhook<T>(method, params);
  }

  return Promise.reject(
    new Error('BX24 недоступен и вебхук не настроен (VITE_B24_WEBHOOK_URL).'),
  );
}

/** REST-вызов через вебхук вне Bitrix24. */
async function fetchWebhook<T = any>(method: string, params: object): Promise<T> {
  const url = `${WEBHOOK_URL}${method}.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`Webhook ${method} вернул HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error_description || json.error);
  }
  return json.result as T;
}

// ---------------------------------------------------------------------------
// Загрузка справочника (список 39)
// ---------------------------------------------------------------------------

/** Загрузить разделы списка. */
export async function fetchListSections(iblockId: number): Promise<ListSection[]> {
  const data = await callMethod<any>('lists.section.get', {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: iblockId,
  });
  return (data || []) as ListSection[];
}

/**
 * Загрузить все элементы списка 39 с признаком рекомендации (PROPERTY_212).
 * Используется пагинация через batch при количестве > 50.
 */
export async function fetchListElements(iblockId: number): Promise<ListElement[]> {
  // Первый запрос для определения total
  const first = await callMethod<any>('lists.element.get', {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: iblockId,
    SELECT: ['ID', 'NAME', 'IBLOCK_SECTION_ID', 'PROPERTY_212'],
  });

  let elements: ListElement[] = (first || []).map(normalizeElement);

  // Пагинация (максимум 50 за раз)
  const total = await callMethod<any>('lists.element.get', {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: iblockId,
  }).then((d) => (Array.isArray(d) ? d.length : 0)).catch(() => 0);

  // Простая стратегия: загружаем порциями по 50 через batch, пока не соберём total
  const BATCH = 50;
  let start = BATCH;
  while (start < total) {
    const page = await callMethod<any>('lists.element.get', {
      IBLOCK_TYPE_ID: 'lists',
      IBLOCK_ID: iblockId,
      SELECT: ['ID', 'NAME', 'IBLOCK_SECTION_ID', 'PROPERTY_212'],
      start,
    });
    if (!Array.isArray(page) || page.length === 0) break;
    elements = elements.concat(page.map(normalizeElement));
    start += BATCH;
  }

  return elements;
}

function normalizeElement(raw: any): ListElement {
  const elem: ListElement = {
    ID: String(raw.ID),
    NAME: raw.NAME,
    IBLOCK_SECTION_ID: raw.IBLOCK_SECTION_ID ? String(raw.IBLOCK_SECTION_ID) : null,
  };
  // PROPERTY_212 может прийти как объект {ID: {...}} или массив
  const rec = raw.PROPERTY_212;
  if (rec && typeof rec === 'object') {
    const vals = Object.values(rec);
    if (vals.length > 0) elem.recommendation = String(vals[0]);
  }
  return elem;
}

// ---------------------------------------------------------------------------
// Загрузка конфигурации (список 37)
// ---------------------------------------------------------------------------

/** Загрузить все элементы конфигурации каскада из списка 37. */
export async function fetchSettings(): Promise<SettingsElement[]> {
  const data = await callMethod<any>('lists.element.get', {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: SETTINGS_IBLOCK_ID,
    SELECT: [
      'ID',
      'NAME',
      'PROPERTY_209', // Тип элемента
      'PROPERTY_211', // Уровень
      'PROPERTY_213', // Если элемент (IF_ELEM)
      'PROPERTY_208', // Показать
      'PROPERTY_215', // Варианты
      'PROPERTY_218', // ID поля списка уровня (UF_CRM_*)
      'PROPERTY_214', // Раздел уровня
    ],
  });

  return (data || []).map(normalizeSettings);
}

function toIdArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'object') {
    return Object.values(value).map((v) => String(v));
  }
  return [String(value)];
}

function normalizeSettings(raw: any): SettingsElement {
  return {
    ID: String(raw.ID),
    NAME: raw.NAME,
    typeId: toIdArray(raw.PROPERTY_209)[0] ?? null,
    level: toIdArray(raw.PROPERTY_211)[0] ?? null,
    ifElementIds: toIdArray(raw.PROPERTY_213),
    showOptionIds: toIdArray(raw.PROPERTY_208),
    variantIds: toIdArray(raw.PROPERTY_215),
    ufField: toIdArray(raw.PROPERTY_218)[0] ?? null,
    sectionId: toIdArray(raw.PROPERTY_214)[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// CRM: сделка
// ---------------------------------------------------------------------------

/**
 * Прочитать поля сделки, в т.ч. пользовательские UF_CRM_*.
 */
export async function fetchDeal(dealId: number): Promise<Record<string, any>> {
  const data = await callMethod<any>('crm.deal.get', { id: dealId });
  return data || {};
}

/**
 * Обновить пользовательские поля сделки (UF_CRM_*).
 */
export async function updateDealFields(
  dealId: number,
  fields: Record<string, any>,
): Promise<void> {
  await callMethod('crm.deal.update', {
    id: dealId,
    fields,
  });
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

export interface PaymentStep {
  /** Название раздела уровня (Способы оплаты / Кому выставляем счет / НДС в счете) */
  sectionName: string;
  /** Код UF_CRM_* поля, куда писать */
  ufField: string | null;
  /** Доступные варианты для выбора (элементы списка 39) */
  options: ListElement[];
}

export function isRecommended(el: ListElement): boolean {
  return el.recommendation === 'рекомендуется';
}

export function isNotRecommended(el: ListElement): boolean {
  return el.recommendation === 'не рекомендуется';
}
