<template>
  <v-card class="payment-params">
    <v-card-text>
      <!-- Загрузка -->
      <div v-if="store.loading" class="d-flex align-center justify-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <template v-else>
        <v-alert
          v-if="store.error"
          type="error"
          variant="tonal"
          class="mb-4"
          dismissible
        >
          {{ store.error }}
        </v-alert>

        <v-alert
          v-if="store.steps.length === 0 && !store.error"
          type="info"
          variant="tonal"
        >
          Нет данных
        </v-alert>

        <!-- Каскад шагов -->
        <div v-for="(step, i) in store.steps" :key="step.ufField || i" class="payment-step">
          <div class="payment-step__header">
            <span class="text-overline font-weight-bold">Уровень {{ i + 1 }}. {{ step.sectionName }}</span>
          </div>

          <v-select
            :model-value="store.selectedForStep(step.ufField)"
            :items="step.options"
            item-title="NAME"
            item-value="ID"
            :label="step.sectionName"
            clearable
            variant="outlined"
            density="comfortable"
            :disabled="!isStepEnabled(step)"
            @update:model-value="onSelect(step, $event)"
          >
            <template #item="{ item, props }">
              <v-list-item v-bind="props" :title="item.raw.NAME">
                <template #append>
                  <v-chip
                    v-if="isRecommended(item.raw)"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    class="ml-2"
                  >
                    рекоменд.
                  </v-chip>
                  <v-chip
                    v-else-if="isNotRecommended(item.raw)"
                    size="x-small"
                    color="warning"
                    variant="tonal"
                    class="ml-2"
                  >
                    не рекоменд.
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </div>
      </template>
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn
        color="primary"
        :disabled="store.loading"
        :loading="saving"
        @click="onSave"
      >
        Сохранить
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { onMounted, ref } from 'vue';
import { usePaymentStore } from '../stores/paymentStore';
import type { PaymentStep, ListElement } from '../functions/paymentApi';

export default {
  name: 'PaymentParamsForm',
  setup() {
    const store = usePaymentStore();
    const saving = ref(false);

    onMounted(() => {
      store.init();
    });

    /** Шаг активен, если родительский шаг уже выбран. */
    const isStepEnabled = (step: PaymentStep): boolean => {
      const idx = store.steps.indexOf(step);
      if (idx === 0) return true;
      const prev = store.steps[idx - 1];
      return !!prev.ufField && !!store.selections[prev.ufField];
    };

    const onSelect = (step: PaymentStep, value: string | string[] | null) => {
      const v = Array.isArray(value) ? value[0] : value;
      if (v == null) return;
      store.selectValue(step.ufField, String(v));
    };

    const isRecommended = (el: ListElement): boolean =>
      el.recommendation === 'рекомендуется';
    const isNotRecommended = (el: ListElement): boolean =>
      el.recommendation === 'не рекомендуется';

    const onSave = async () => {
      saving.value = true;
      try {
        await store.save();
      } finally {
        saving.value = false;
      }
    };

    return {
      store,
      saving,
      isStepEnabled,
      onSelect,
      isRecommended,
      isNotRecommended,
      onSave,
    };
  },
};
</script>

<style lang="sass">
.payment-step
  margin-bottom: 0.5rem

.payment-step__header
  margin-bottom: 0.25rem

.payment-step__header .text-overline
  letter-spacing: 0.08em
  color: rgba(0, 0, 0, 0.6)

.v-input__details
  display: none !important

#app .v-card .v-card-text
  padding: 0 0.5rem

.v-btn.v-btn--density-default
  height: 0

.v-card-actions
  align-items: start
</style>
