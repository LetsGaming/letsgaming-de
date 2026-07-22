<template>
  <!-- Deliberately bare: the dashboard's chrome (brand, tabs, footer) belongs to
       AreaPage, and the docs routes bring their own sidebar shell. A layout that
       imposed one of those on the other would be the kind of false sharing this
       migration is meant to remove. -->
  <slot />
</template>
