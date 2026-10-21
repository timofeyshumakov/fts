<template>
  <v-app>
    <v-main>
      <v-container class="fill-height pa-0" fluid>
        <PaymentParamsForm />
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import PaymentParamsForm from './components/PaymentParamsForm.vue';

export default {
  name: 'App',
  components: {
    PaymentParamsForm,
  },
};
</script>

<style scoped lang="sass">
:deep(.payment-params)
  width: 100%
  min-height: 100vh
  border-radius: 0
  box-shadow: none
</style>
