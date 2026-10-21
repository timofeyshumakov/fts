/**
 * Хранилище параметров оплаты.
 *
 * Логика каскада:
 *  1. Есть корневая настройка «Параметры оплаты» (Уровень 0).
 *  2. Её варианты (PROPERTY_215) — это «Если Нал» / «Если Безнал».
 *  3. Каждый «Если X» показывает варианты из PROPERTY_208 и имеет свои
 *     дочерние варианты (PROPERTY_215), и так далее.
 *
 * При выборе значения на каждом шаге мы пишем его в соответствующее
 * UF_CRM_* поле сделки, а дочерний шаг активируем по условию IfElementIds.
 */
import { defineStore } from 'pinia';
import {
  fetchSettings,
  fetchListSections,
  fetchListElements,
  fetchDeal,
  updateDealFields,
  OPTIONS_IBLOCK_ID,
  TYPE_SETTING,
  type SettingsElement,
  type ListElement,
  type ListSection,
  type PaymentStep,
} from '../functions/paymentApi';

export const usePaymentStore = defineStore('payment', {
  state: () => ({
    loading: false,
    error: null as string | null,
    /** Строка статуса для диагностики (что происходит прямо сейчас). */
    status: '' as string,

    dealId: null as number | null,

    // Справочник (список 39)
    sections: [] as ListSection[],
    elements: [] as ListElement[],

    // Конфигурация (список 37)
    settings: [] as SettingsElement[],

    // Результаты выбора: код UF_CRM_* -> ID выбранного элемента
    selections: {} as Record<string, string>,
  }),

  getters: {
    /** Карта ID элемента -> элемент справочника. */
    elementMap(state): Record<string, ListElement> {
      const map: Record<string, ListElement> = {};
      for (const el of state.elements) map[el.ID] = el;
      return map;
    },

    /** Карта ID раздела -> имя раздела. */
    sectionMap(state): Record<string, string> {
      const map: Record<string, string> = {};
      for (const s of state.sections) map[s.ID] = s.NAME;
      return map;
    },

    /** Корневая настройка «Параметры оплаты». */
    rootSetting(state): SettingsElement | null {
      return (
        state.settings.find((s) => s.typeId === TYPE_SETTING) ??
        state.settings.find((s) => s.NAME === 'Параметры оплаты') ??
        null
      );
    },

    /**
     * Построить каскад шагов на основе сделанного выбора.
     * Возвращает список шагов: каждый шаг знает свои варианты.
     */
    steps(state): PaymentStep[] {
      const settings = state.settings;
      const root = settings.find((s) => s.typeId === TYPE_SETTING) || settings[0];
      if (!root) return [];

      const result: PaymentStep[] = [];
      const sectionMap = this.sectionMap;
      const elementMap = this.elementMap;

      // Шаг 0: корневая настройка
      const rootOptions = this.optionsForSetting(root);
      result.push({
        sectionName: 'Параметры оплаты',
        ufField: root.ufField,
        options: rootOptions,
      });

      // Текущее значение корневого шага определяет, какой дочерний узел активен
      let currentNode: SettingsElement | null = this.childForCurrentSelection(root);

      // Глубина обхода (защита от циклов)
      let guard = 0;
      while (currentNode && guard < 10) {
        const options = this.optionsForSetting(currentNode);
        const sectionId = currentNode.sectionId;
        const sectionName = sectionId
          ? sectionMap[sectionId] || currentNode.NAME
          : currentNode.NAME;

        result.push({
          sectionName,
          ufField: currentNode.ufField,
          options,
        });

        const next = this.childForCurrentSelection(currentNode);
        if (!next) break;
        currentNode = next;
        guard++;
      }

      return result;
    },
  },

  actions: {
    /**
     * Инициализация: дождаться готовности Bitrix24, определить ID сделки
     * из placement и загрузить данные.
     */
    init(): Promise<void> {
      return new Promise((resolve) => {
        this.loading = true;
        this.status = 'Инициализация Bitrix24…';

        // @ts-ignore
        if (typeof BX24 === 'undefined') {
          // Вне Bitrix24 (например, dev) — сразу запускаем логику
          this.bootstrap()
            .catch((e) => {
              console.error('Ошибка инициализации:', e);
              this.status = `Ошибка: ${e?.message || e}`;
            })
            .finally(() => {
              this.loading = false;
              resolve();
            });
          return;
        }

        // @ts-ignore
        BX24.ready(() => {
          // @ts-ignore
          BX24.init(() => {
            this.status = 'Bitrix24 готов. Загрузка данных…';
            this.bootstrap()
              .catch((e) => {
                console.error('Ошибка инициализации:', e);
                this.status = `Ошибка: ${e?.message || e}`;
              })
              .finally(() => {
                this.loading = false;
                resolve();
              });
          });
        });
      });
    },

    /** Основная логика загрузки после готовности BX24. */
    async bootstrap() {
      this.status = 'Загрузка конфигурации…';
      await this.loadData();
      this.status = 'Определение сделки…';
      await this.detectDealId();
      this.status = `Чтение сделки ${this.dealId}…`;
      if (this.dealId) {
        await this.loadDeal(this.dealId);
      }
      this.status = this.dealId
        ? `Сделка ${this.dealId}. Данные загружены.`
        : 'Данные загружены.';
    },

    /** Получить ID сделки из placement (с fallback 5392). */
    detectDealId(): Promise<void> {
      return new Promise((resolve) => {
        let id: number | null = null;

        try {
          // @ts-ignore
          if (typeof BX24 !== 'undefined' && typeof BX24.placement === 'object') {
            // @ts-ignore
            const info = BX24.placement.info();
            const options = info?.options ?? {};
            console.info('[payment] placement:', info?.placement, options);
            const rawId =
              options.ENTITY_VALUE_ID ??
              options.ID ??
              options.entity_value_id ??
              null;
            if (rawId) {
              id = Number(rawId);
              console.log('[payment] dealId из placement:', id);
            }
          }
        } catch (e) {
          console.warn('Не удалось определить ID сделки из placement:', e);
        }

        if (!id) {
          id = 5392;
          console.log('[payment] placement не дал ID, fallback на тестовую сделку:', id);
        }

        this.dealId = id;
        resolve();
      });
    },

    /** Установить ID сделки вручную (например, из URL или параметров). */
    setDealId(dealId: number) {
      this.dealId = dealId;
      return this.loadDeal(dealId);
    },

    /** ID выбранного элемента для данного поля UF_CRM_*. */
    selectedForStep(ufField: string | null): string | null {
      return ufField ? this.selections[ufField] ?? null : null;
    },

    /** Загрузить всю конфигурацию и справочник (без управления loading). */
    async loadData() {
      this.error = null;
      const [settings, sections, elements] = await Promise.all([
        fetchSettings(),
        fetchListSections(OPTIONS_IBLOCK_ID),
        fetchListElements(OPTIONS_IBLOCK_ID),
      ]);
      this.settings = settings;
      this.sections = sections;
      this.elements = elements;
    },

    /** Загрузить данные конкретной сделки (dealId задаётся извне). */
    async loadDeal(dealId: number) {
      this.dealId = dealId;
      try {
        const deal = await fetchDeal(dealId);
        console.log('[payment] crm.deal.get:', deal);
        // Считываем известные UF_CRM_* поля из поступивших данных
        if (deal && typeof deal === 'object') {
          const knownFields = this.settings
            .map((s) => s.ufField)
            .filter((f): f is string => !!f);
          for (const key of knownFields) {
            const value = deal[key];
            if (value !== undefined && value !== null && value !== '') {
              this.selections[key] = String(value);
              console.log('[payment] прочитано:', key, '=', value);
            }
          }
        }
        this.status = `Сделка ${dealId}: параметры загружены.`;
      } catch (e: any) {
        console.error('Ошибка загрузки сделки:', e);
        this.status = `Ошибка чтения сделки: ${e?.message || e}`;
      }
    },

    /** Варианты, которые показывает данный конфигурационный элемент. */
    optionsForSetting(setting: SettingsElement): ListElement[] {
      const ids = setting.showOptionIds;
      const elementMap = this.elementMap;
      return ids
        .map((id) => elementMap[id])
        .filter(Boolean) as ListElement[];
    },

    /**
     * Найти дочерний конфигурационный узел, чьё условие (IfElementIds)
     * соответствует текущему выбору на этом узле.
     */
    childForCurrentSelection(setting: SettingsElement): SettingsElement | null {
      const uf = setting.ufField;
      if (!uf) return null;
      const selected = this.selections[uf];
      if (!selected) return null;

      const children = this.settings.filter((s) =>
        setting.variantIds.includes(s.ID),
      );

      return (
        children.find((c) => c.ifElementIds.includes(selected)) ?? null
      );
    },

    /** Обработать выбор значения на шаге (только в локальном состоянии). */
    selectValue(ufField: string | null, valueId: string) {
      if (!ufField) return;
      this.selections[ufField] = valueId;

      // Сбрасываем дочерние значения, чтобы не было неконсистентности
      this.clearDependents(ufField);
    },

    /**
     * Сохранить накопленный выбор в сделку (crm.deal.update),
     * затем перезагрузить данные сделки.
     */
    async save() {
      if (!this.dealId) {
        this.status = 'Нельзя сохранить: сделка не определена.';
        return false;
      }

      const fields: Record<string, any> = {};
      for (const step of this.steps) {
        if (step.ufField && this.selections[step.ufField]) {
          fields[step.ufField] = this.selections[step.ufField];
        }
      }

      // Дополнительно пишем фиксированное значение 1 в указанное поле
      fields['UF_CRM_1792483215026'] = '1';

      if (Object.keys(fields).length === 0) {
        this.status = 'Нет выбранных значений для сохранения.';
        return false;
      }

      this.status = `Сохранение в сделку ${this.dealId}…`;
      try {
        await updateDealFields(this.dealId, fields);
        console.log('[payment] сохранено в сделку:', this.dealId, fields);
      } catch (e: any) {
        this.status = `Ошибка сохранения: ${e?.message || e}`;
        console.error('Ошибка сохранения:', e);
        return false;
      }

      // Перезагружаем данные сделки после сохранения
      this.status = `Сделка ${this.dealId}. Перезагрузка данных…`;
      await this.loadDeal(this.dealId);
      this.status = `Сохранено в сделку ${this.dealId}.`;
      return true;
    },

    /** Сбросить выбор всех полей, зависящих от данного. */
    clearDependents(ufField: string) {
      // Находим конфиг по полю
      const setting = this.settings.find((s) => s.ufField === ufField);
      if (!setting) return;

      // Рекурсивно очищаем дочерние поля
      const children = this.settings.filter((s) =>
        setting.variantIds.includes(s.ID),
      );
      for (const child of children) {
        if (child.ufField && this.selections[child.ufField]) {
          const childField = child.ufField;
          this.selections[childField] = '' as any;
          delete this.selections[childField];
          this.clearDependents(childField);
        }
      }
    },
  },
});