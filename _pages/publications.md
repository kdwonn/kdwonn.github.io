---
layout: page
permalink: /publications/
title: Publications
description: 
years: [2026, 2025, 2024, 2023, 2022, 2021, 2020]
nav: true
# nav_order: 1
---
<!-- _pages/publications.md -->
<div class="publications">

<p class="pub-legend"><span class="pub-legend-lead">Highlighted</span>: first, co-first, or co-corresponding author &middot; * equal contribution &middot; &dagger; co-corresponding</p>

{%- for y in page.years %}
  <h2 class="year">{{y}}</h2>
  {% bibliography -f {{ site.scholar.bibliography }} -q @*[year={{y}}]* %}
{% endfor %}

</div>
