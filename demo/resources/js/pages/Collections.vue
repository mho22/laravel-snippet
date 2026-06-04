<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { createApp, h, onBeforeUnmount, onMounted, ref, watch, type App } from 'vue';

import LaravelSnippet from '@/components/LaravelSnippet.vue';

const props = defineProps<{
    title: string;
    body: string;
    snippets: Record<string, { php: string; highlighted: string }>;
}>();

const bodyRef = ref<HTMLDivElement | null>(null);
let mounted: App[] = [];

function hydrate() {
    teardown();
    const root = bodyRef.value;
    if (!root) return;
    const placeholders = root.querySelectorAll<HTMLDivElement>('[data-snippet-id]');
    placeholders.forEach((el) => {
        const id = el.dataset.snippetId;
        if (!id) return;
        const snippet = props.snippets[id];
        if (!snippet) return;
        const app = createApp({
            render: () =>
                h(LaravelSnippet, { php: snippet.php, highlighted: snippet.highlighted }),
        });
        app.mount(el);
        mounted.push(app);
    });
}

function teardown() {
    mounted.forEach((a) => a.unmount());
    mounted = [];
}

onMounted(hydrate);
onBeforeUnmount(teardown);
watch(() => [props.body, props.snippets], hydrate, { deep: false });
</script>

<template>
    <Head :title="`${title} — Laravel snippet demo`" />
    <div ref="bodyRef" id="main-content" class="contains-code-blocks" v-html="body" />
</template>
