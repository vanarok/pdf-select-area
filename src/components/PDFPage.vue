<template>
  <div>
    <div v-bind="canvasAttrs" style="position: relative">
      <canvas
        v-bind="canvasAttrs"
        @mousedown="startPainting"
        @mouseup="finishedPainting"
        @mousemove="selectRegion"
        ref="selection"
      ></canvas>

      <canvas ref="pdf" v-visible.once="drawPage" v-bind="canvasAttrs"></canvas>
    </div>

    <div style="position: fixed; top: 0; right: 0; padding: 6rem 3rem 0 0">
      <div
        style="
          display: flex;
          gap: 10px;
          width: 300px;
          background: rgba(0, 0, 0, 0.05);
          padding: 10px;
        "
        v-if="selectedRegion.w > 0"
      >
        <div style="width: 100px; height: 100px; background: lightgreen" />
        <div style="font-size: 25px; margin-top: -30px">
          <p>X = {{ selectedRegion.x }}</p>
          <p>Y = {{ selectedRegion.y }}</p>
          <p>W = {{ selectedRegion.w }}</p>
          <p>H = {{ selectedRegion.h }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import debug from "debug";
const log = debug("app:components/PDFPage");

import { PIXEL_RATIO } from "../utils/constants";
import visible from "../directives/visible";

export default {
  name: "PDFPage",
  data: function () {
    return {
      canvas: null,
      ctx: null,
      painting: false,

      startX: 0,
      startY: 0,
      selectedRegion: {
        x: null,
        y: null,
        w: null,
        h: null,
      },
    };
  },
  props: {
    page: {
      type: Object, // instance of PDFPageProxy returned from pdf.getPage
      required: true,
    },
    scale: {
      type: Number,
      required: true,
    },
    optimalScale: {
      type: Number,
      required: true,
    },
    isPageFocused: {
      type: Boolean,
      default: false,
    },
    isElementFocused: {
      type: Boolean,
      default: false,
    },
  },

  directives: {
    visible,
  },

  computed: {
    actualSizeViewport() {
      return this.viewport.clone({ scale: this.scale });
    },

    canvasStyle() {
      const { width: actualSizeWidth, height: actualSizeHeight } =
        this.actualSizeViewport;
      const [pixelWidth, pixelHeight] = [actualSizeWidth, actualSizeHeight].map(
        (dim) => Math.ceil(dim / PIXEL_RATIO)
      );
      return `width: ${pixelWidth}px; height: ${pixelHeight}px;`;
    },

    canvasAttrs() {
      let { width, height } = this.viewport;
      [width, height] = [width, height].map((dim) => Math.ceil(dim));
      const style = this.canvasStyle;

      return {
        width,
        height,
        style,
        class: "pdf-page box-shadow",
      };
    },

    pageNumber() {
      return this.page.pageNumber;
    },
  },

  methods: {
    focusPage() {
      if (this.isPageFocused) return;

      this.$emit("page-focus", this.pageNumber);
    },

    drawPage() {
      if (this.renderTask) return;

      const { viewport } = this;
      const canvasContext = this.$refs.pdf.getContext("2d");
      const renderContext = { canvasContext, viewport };

      // PDFPageProxy#render
      // https://mozilla.github.io/pdf.js/api/draft/PDFPageProxy.html
      this.renderTask = this.page.render(renderContext);
      this.renderTask
        .then(() => {
          this.$emit("page-rendered", {
            page: this.page,
            text: `Rendered page ${this.pageNumber}`,
          });
        })
        .catch((response) => {
          this.destroyRenderTask();
          this.$emit("page-errored", {
            response,
            page: this.page,
            text: `Failed to render page ${this.pageNumber}`,
          });
        });
    },

    updateVisibility() {
      this.$parent.$emit("update-visibility");
    },

    destroyPage(page) {
      // PDFPageProxy#_destroy
      // https://mozilla.github.io/pdf.js/api/draft/PDFPageProxy.html
      if (page) page._destroy();

      this.destroyRenderTask();
    },

    destroyRenderTask() {
      if (!this.renderTask) return;

      // RenderTask#cancel
      // https://mozilla.github.io/pdf.js/api/draft/RenderTask.html
      this.renderTask.cancel();
      delete this.renderTask;
    },

    getMousePos(canvas, evt) {
      var rect = canvas.getBoundingClientRect(), // abs. size of element
        scaleX = canvas.width / rect.width, // relationship bitmap vs. element for X
        scaleY = canvas.height / rect.height; // relationship bitmap vs. element for Y

      return [
        (evt.clientX - rect.left) * scaleX,
        (evt.clientY - rect.top) * scaleY,
      ];
    },
    getCanvasCoords(ctx, screenX, screenY) {
      let matrix = ctx.getTransform();
      var imatrix = matrix.invertSelf();
      let x = screenX * imatrix.a + screenY * imatrix.c + imatrix.e;
      let y = screenX * imatrix.b + screenY * imatrix.d + imatrix.f;
      return [x, y];
    },
    selectRegion(e) {
      if (!this.painting) return;
      this.ctx.lineWidth = 3;

      const [xMouse, yMouse] = this.getMousePos(this.canvas, e);
      const [xCanvas, yCanvas] = this.getCanvasCoords(this.ctx, xMouse, yMouse);

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.beginPath();
      this.ctx.rect(
        this.startX,
        this.startY,
        xCanvas - this.startX,
        yCanvas - this.startY
      );
      this.ctx.stroke();
      this.selectedRegion.w = Math.abs(Math.round(xCanvas - this.startX));
      this.selectedRegion.h = Math.abs(Math.round(yCanvas - this.startY));
      this.selectedRegion.x = Math.round(this.startX);
      this.selectedRegion.y = Math.round(this.startY);
    },

    startPainting(event) {
      this.selectedRegion = {
        x: null,
        y: null,
        w: null,
        h: null,
      };
      this.painting = true;
      const [xMouse, yMouse] = this.getMousePos(this.canvas, event);
      const [xCanvas, yCanvas] = this.getCanvasCoords(this.ctx, xMouse, yMouse);
      this.startX = xCanvas;
      this.startY = yCanvas;
      this.selectRegion(event);
    },
    finishedPainting() {
      this.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
      this.ctx.fill();

      this.painting = false;
      this.startX = 0;
      this.startY = 0;
      this.ctx.beginPath();
    },
  },

  watch: {
    scale: "updateVisibility",

    page(_newPage, oldPage) {
      this.destroyPage(oldPage);
    },

    isElementFocused(isElementFocused) {
      if (isElementFocused) this.focusPage();
    },
  },

  created() {
    // PDFPageProxy#getViewport
    // https://mozilla.github.io/pdf.js/api/draft/PDFPageProxy.html
    this.viewport = this.page.getViewport(this.optimalScale);
  },

  mounted() {
    log(`Page ${this.pageNumber} mounted`);

    this.canvas = this.$refs.selection;
    this.ctx = this.$refs.selection.getContext("2d");

    this.$refs.selection.style.position = "absolute";
    this.$refs.selection.style.top = "0";
    this.$refs.selection.style.left = "0";
    this.$refs.selection.width = this.$refs.pdf.width;
    this.$refs.selection.height = this.$refs.pdf.height;
  },

  beforeDestroy() {
    this.destroyPage(this.page);
  },
};
</script>
<style>
.pdf-page {
  display: block;
  margin: 0 auto;
}
</style>
