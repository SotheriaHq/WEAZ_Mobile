package expo.modules.wiezliquidglass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WiezLiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WiezLiquidGlass")

    Constant("supportsRuntimeShader") {
      LiquidGlassShaderDiagnostics.supportsRuntimeShader()
    }

    Constant("supportsRenderEffectBlur") {
      Build.VERSION.SDK_INT >= 31
    }

    Constant("shaderCompileError") {
      LiquidGlassShaderDiagnostics.lastCompileError()
    }

    Constant("engineVersion") {
      2
    }

    View(WiezLiquidGlassBackdropView::class) {
      Name("WiezLiquidGlassBackdropView")
    }

    View(WiezLiquidGlassLensView::class) {
      Name("WiezLiquidGlassLensView")

      Prop("targetViewId") { view: WiezLiquidGlassLensView, targetViewId: Int? ->
        view.setTargetViewId(targetViewId)
      }

      Prop("cornerRadius") { view: WiezLiquidGlassLensView, cornerRadius: Float? ->
        view.setCornerRadius(cornerRadius ?: 999f)
      }

      Prop("blurRadius") { view: WiezLiquidGlassLensView, blurRadius: Float? ->
        view.setBlurRadius(blurRadius ?: 0f)
      }

      Prop("refractionStrength") { view: WiezLiquidGlassLensView, refractionStrength: Float? ->
        view.setRefractionStrength(refractionStrength ?: 0.88f)
      }

      Prop("chromaticAberration") { view: WiezLiquidGlassLensView, chromaticAberration: Float? ->
        view.setChromaticAberration(chromaticAberration ?: 0f)
      }

      Prop("rimStrength") { view: WiezLiquidGlassLensView, rimStrength: Float? ->
        view.setRimStrength(rimStrength ?: 1.0f)
      }

      Prop("reflectionStrength") { view: WiezLiquidGlassLensView, reflectionStrength: Float? ->
        view.setReflectionStrength(reflectionStrength ?: 1.0f)
      }

      Prop("curvature") { view: WiezLiquidGlassLensView, curvature: Float? ->
        view.setCurvature(curvature ?: 0.58f)
      }

      Prop("opticalThickness") { view: WiezLiquidGlassLensView, opticalThickness: Float? ->
        view.setOpticalThickness(opticalThickness ?: 0.48f)
      }

      Prop("tintColor") { view: WiezLiquidGlassLensView, tintColor: Int? ->
        view.setTintColorValue(tintColor)
      }

      Prop("tintAlpha") { view: WiezLiquidGlassLensView, tintAlpha: Float? ->
        view.setTintAlpha(tintAlpha ?: 0.02f)
      }

      Prop("fallbackColor") { view: WiezLiquidGlassLensView, fallbackColor: Int? ->
        view.setFallbackColorValue(fallbackColor)
      }

      Prop("isDark") { view: WiezLiquidGlassLensView, isDark: Boolean? ->
        view.setIsDark(isDark ?: false)
      }

      Prop("pressed") { view: WiezLiquidGlassLensView, pressed: Boolean? ->
        view.setPressedState(pressed ?: false)
      }

      OnViewDidUpdateProps { view: WiezLiquidGlassLensView ->
        view.applyConfig()
      }
    }
  }
}
