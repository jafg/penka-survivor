<script setup lang="ts">
import { usePoolsStore } from '../stores/pools';

const pools = usePoolsStore();
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Penkas activas</h2>
      <span class="hint">GET /admin/v1/penkas</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Penka</th>
          <!-- The prototype's column was "Tenant". `AdminPoolSummary` carries no
               tenant; the join code is the operational handle it does carry. -->
          <th>Código</th>
          <th>Jugadores</th>
          <th>En carrera</th>
          <th>La Isla</th>
          <th>Picks</th>
          <th>Fechas resueltas</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="pool in pools.pools" :key="pool.penka.id">
          <td class="cell-strong">{{ pool.penka.name }}</td>
          <td class="cell-muted">{{ pool.penka.joinCode }}</td>
          <td class="tnum">{{ pool.entryCount }}</td>
          <td class="tnum">{{ pool.aliveCount }}</td>
          <td class="tnum">{{ pool.islandCount }}</td>
          <td class="tnum">{{ pool.picksReceived }}</td>
          <!-- A COUNT, not a list of numbers: the prototype's mock had it the
               other way round and joined them with commas. -->
          <td class="tnum">{{ pool.resolvedMatchdays }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="pools.pools.length === 0" class="table-empty">Todavía no hay penkas.</div>
  </section>
</template>
