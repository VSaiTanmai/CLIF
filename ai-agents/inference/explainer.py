"""
CLIF Explainable AI (XAI) Module
==================================
Provides SHAP-based model explanations for ML classification decisions.

Uses TreeExplainer for tree-based models (ExtraTrees, XGBoost, LightGBM)
which computes exact SHAP values efficiently in polynomial time.

Architecture:
    CLIFExplainer wraps SHAP TreeExplainer and provides:
    - Per-prediction feature contribution analysis
    - Top-K feature identification (drivers of the decision)
    - Global feature importance (model-wide)
    - Human-readable explanation generation from SHAP values
    - Waterfall data for visualization (base value → prediction)

Usage:
    from inference.explainer import CLIFExplainer
    explainer = CLIFExplainer(binary_model, multi_model, feature_names)
    xai_result = explainer.explain(X, is_attack, category, class_names)
"""

from __future__ import annotations

import logging
import warnings
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger("clif.xai")

# Suppress SHAP's verbose output during TreeExplainer init
warnings.filterwarnings("ignore", category=UserWarning, module="shap")


# ── Human-readable feature name mapping ──────────────────────────────────────

FEATURE_DISPLAY_NAMES: Dict[str, str] = {
    # Core traffic features
    "duration": "Connection Duration",
    "src_bytes": "Source Bytes",
    "dst_bytes": "Destination Bytes",
    "land": "Land Attack Flag",
    "wrong_fragment": "Wrong Fragments",
    "urgent": "Urgent Packets",
    # Content features
    "hot": "Hot Indicators",
    "num_failed_logins": "Failed Logins",
    "logged_in": "Logged In",
    "num_compromised": "Compromised Conditions",
    "root_shell": "Root Shell Obtained",
    "su_attempted": "SU Attempted",
    "num_root": "Root Access Count",
    "num_file_creations": "File Creations",
    "num_shells": "Shell Commands",
    "num_access_files": "Access Files",
    "num_outbound_cmds": "Outbound Commands",
    "is_host_login": "Host Login",
    "is_guest_login": "Guest Login",
    # Traffic features
    "count": "Connection Count",
    "srv_count": "Service Count",
    "serror_rate": "SYN Error Rate",
    "srv_serror_rate": "Service SYN Error Rate",
    "rerror_rate": "REJ Error Rate",
    "srv_rerror_rate": "Service REJ Error Rate",
    "same_srv_rate": "Same Service Rate",
    "diff_srv_rate": "Different Service Rate",
    "srv_diff_host_rate": "Service Diff Host Rate",
    # Host-based features
    "dst_host_count": "Dest Host Count",
    "dst_host_srv_count": "Dest Host Service Count",
    "dst_host_same_srv_rate": "Dest Host Same Service Rate",
    "dst_host_diff_srv_rate": "Dest Host Diff Service Rate",
    "dst_host_same_src_port_rate": "Dest Host Same Src Port Rate",
    "dst_host_srv_diff_host_rate": "Dest Host Srv Diff Host Rate",
    "dst_host_serror_rate": "Dest Host SYN Error Rate",
    "dst_host_srv_serror_rate": "Dest Host Srv SYN Error Rate",
    "dst_host_rerror_rate": "Dest Host REJ Error Rate",
    "dst_host_srv_rerror_rate": "Dest Host Srv REJ Error Rate",
}

# Feature categories for grouping in visualizations
FEATURE_CATEGORIES: Dict[str, str] = {
    "duration": "traffic",
    "src_bytes": "traffic",
    "dst_bytes": "traffic",
    "land": "traffic",
    "wrong_fragment": "traffic",
    "urgent": "traffic",
    "hot": "content",
    "num_failed_logins": "content",
    "logged_in": "content",
    "num_compromised": "content",
    "root_shell": "content",
    "su_attempted": "content",
    "num_root": "content",
    "num_file_creations": "content",
    "num_shells": "content",
    "num_access_files": "content",
    "num_outbound_cmds": "content",
    "is_host_login": "content",
    "is_guest_login": "content",
    "count": "connection",
    "srv_count": "connection",
    "serror_rate": "error_rate",
    "srv_serror_rate": "error_rate",
    "rerror_rate": "error_rate",
    "srv_rerror_rate": "error_rate",
    "same_srv_rate": "connection",
    "diff_srv_rate": "connection",
    "srv_diff_host_rate": "connection",
    "dst_host_count": "host",
    "dst_host_srv_count": "host",
    "dst_host_same_srv_rate": "host",
    "dst_host_diff_srv_rate": "host",
    "dst_host_same_src_port_rate": "host",
    "dst_host_srv_diff_host_rate": "host",
    "dst_host_serror_rate": "host",
    "dst_host_srv_serror_rate": "host",
    "dst_host_rerror_rate": "host",
    "dst_host_srv_rerror_rate": "host",
}

CATEGORY_LABELS = {
    "traffic": "Traffic Features",
    "content": "Content Features",
    "connection": "Connection Features",
    "error_rate": "Error Rate Features",
    "host": "Host-Based Features",
    "protocol": "Protocol/Service",
}


def _get_display_name(feature: str) -> str:
    """Get a human-readable display name for a feature."""
    if feature in FEATURE_DISPLAY_NAMES:
        return FEATURE_DISPLAY_NAMES[feature]
    # Handle one-hot encoded features (e.g., "protocol_type_tcp")
    for prefix in ("protocol_type_", "service_", "flag_"):
        if feature.startswith(prefix):
            base = prefix.rstrip("_").replace("_", " ").title()
            value = feature[len(prefix):]
            return f"{base}: {value}"
    return feature.replace("_", " ").title()


def _get_feature_category(feature: str) -> str:
    """Get the category of a feature for grouping."""
    if feature in FEATURE_CATEGORIES:
        return FEATURE_CATEGORIES[feature]
    if feature.startswith("protocol_type_"):
        return "protocol"
    if feature.startswith("service_"):
        return "protocol"
    if feature.startswith("flag_"):
        return "traffic"
    return "other"


class CLIFExplainer:
    """
    SHAP-based explainer for CLIF ML models.

    Wraps SHAP TreeExplainer for efficient, exact explanations
    of tree-based model predictions.
    """

    def __init__(
        self,
        binary_model,
        multi_model,
        feature_names: List[str],
        top_k: int = 10,
    ):
        """
        Initialize SHAP explainers for both binary and multiclass models.

        Args:
            binary_model: Trained binary classifier (attack/normal).
            multi_model: Trained multiclass classifier (DoS/Normal/Probe/R2L/U2R).
            feature_names: List of encoded feature column names.
            top_k: Number of top features to include in explanations.
        """
        self.feature_names = feature_names
        self.top_k = top_k
        self._binary_explainer = None
        self._multi_explainer = None
        self._binary_model = binary_model
        self._multi_model = multi_model
        self._initialized = False

        # Lazy init — SHAP explainers are created on first use
        # to avoid slowing down service startup
        logger.info(
            "[XAI] CLIFExplainer created (lazy init, %d features, top_k=%d)",
            len(feature_names), top_k,
        )

    def _ensure_initialized(self):
        """Lazy-initialize SHAP TreeExplainers on first use."""
        if self._initialized:
            return

        try:
            import shap

            logger.info("[XAI] Initializing SHAP TreeExplainers...")

            self._binary_explainer = shap.TreeExplainer(
                self._binary_model,
                feature_names=self.feature_names,
            )
            self._multi_explainer = shap.TreeExplainer(
                self._multi_model,
                feature_names=self.feature_names,
            )
            self._initialized = True

            logger.info(
                "[XAI] SHAP TreeExplainers initialized — "
                "binary expected_value=%s, multi classes=%d",
                str(getattr(self._binary_explainer, 'expected_value', 'N/A'))[:50],
                len(getattr(self._multi_explainer, 'expected_value', [])),
            )
        except Exception as e:
            logger.error("[XAI] Failed to initialize SHAP explainers: %s", e)
            raise

    def explain(
        self,
        X: np.ndarray,
        is_attack: bool,
        category: str,
        class_names: List[str],
        event: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate SHAP-based explanation for a single prediction.

        Args:
            X: Preprocessed feature vector (1, n_features).
            is_attack: Binary classification result.
            category: Multiclass prediction (DoS/Normal/Probe/R2L/U2R).
            class_names: List of class names for multiclass model.
            event: Original raw event dict (for feature value context).

        Returns:
            Dict with XAI data:
                - top_features: List of {feature, display_name, shap_value, 
                                          feature_value, impact, category}
                - feature_contributions: Dict mapping feature->shap_value (all features)
                - binary_base_value: Expected value for binary model
                - binary_shap_values: All SHAP values for binary prediction
                - multi_base_values: Expected values per class
                - multi_shap_values: SHAP values for predicted class
                - prediction_drivers: Human-readable summary
                - waterfall: {base_value, output_value, features[]} for visualization
                - model_type: "binary" or "multiclass"
        """
        self._ensure_initialized()

        try:
            result = {}

            # ── Binary SHAP values ───────────────────────────────────────
            binary_shap = self._binary_explainer.shap_values(X)
            binary_ev = self._binary_explainer.expected_value
            # SHAP >=0.50 returns ndarray; older versions return list-of-arrays
            if isinstance(binary_shap, list):
                # Old format: list of (n_samples, n_features) per class
                binary_sv = binary_shap[1][0]  # attack class, first sample
                binary_base = float(np.asarray(binary_ev).flatten()[1])
            elif binary_shap.ndim == 3:
                # New format: (n_samples, n_features, n_classes)
                binary_sv = binary_shap[0, :, 1]  # first sample, attack class
                binary_base = float(np.asarray(binary_ev).flatten()[1])
            else:
                # (n_samples, n_features) — single-output
                binary_sv = binary_shap[0]
                binary_base = float(np.asarray(binary_ev).flatten()[0])

            # ── Multiclass SHAP values ───────────────────────────────────
            multi_shap = self._multi_explainer.shap_values(X)
            multi_ev = self._multi_explainer.expected_value
            pred_idx = class_names.index(category) if category in class_names else 0

            if isinstance(multi_shap, list):
                # Old format: list of (n_samples, n_features) per class
                multi_sv = multi_shap[pred_idx][0]
                multi_bases = [float(v) for v in np.asarray(multi_ev).flatten()]
            elif multi_shap.ndim == 3:
                # New format: (n_samples, n_features, n_classes)
                multi_sv = multi_shap[0, :, pred_idx]  # first sample, predicted class
                multi_bases = [float(v) for v in np.asarray(multi_ev).flatten()]
            else:
                # (n_samples, n_features) — single-output fallback
                multi_sv = multi_shap[0]
                multi_bases = [float(np.asarray(multi_ev).flatten()[0])]

            # ── Select primary SHAP values based on attack status ────────
            # For attacks: use multiclass SHAP (more specific)
            # For benign: use binary SHAP
            if is_attack:
                primary_sv = multi_sv
                primary_base = float(multi_bases[pred_idx]) if pred_idx < len(multi_bases) else multi_bases[0]
                model_type = "multiclass"
            else:
                primary_sv = binary_sv
                primary_base = binary_base
                model_type = "binary"

            # ── Build feature contributions ──────────────────────────────
            feature_contributions = {}
            for i, fname in enumerate(self.feature_names):
                feature_contributions[fname] = round(float(primary_sv[i]), 6)

            # ── Top-K features by absolute SHAP value ────────────────────
            abs_sv = np.abs(primary_sv)
            top_indices = np.argsort(abs_sv)[::-1][:self.top_k]

            top_features = []
            for idx in top_indices:
                fname = self.feature_names[idx]
                sv = float(primary_sv[idx])
                fval = float(X[0][idx])

                # Get raw value from event if available
                raw_val = None
                if event and fname in event:
                    raw_val = event[fname]
                elif event:
                    # Try without one-hot encoding prefix
                    for prefix in ("protocol_type_", "service_", "flag_"):
                        if fname.startswith(prefix) and fval > 0:
                            raw_val = fname[len(prefix):]
                            break

                top_features.append({
                    "feature": fname,
                    "display_name": _get_display_name(fname),
                    "shap_value": round(sv, 6),
                    "abs_shap_value": round(abs(sv), 6),
                    "feature_value": round(fval, 4) if isinstance(fval, float) else fval,
                    "raw_value": raw_val,
                    "impact": "positive" if sv > 0 else "negative",
                    "category": _get_feature_category(fname),
                })

            # ── Waterfall data (for visualization) ───────────────────────
            # Shows how base value + contributions → final prediction
            waterfall_features = []
            for idx in top_indices:
                fname = self.feature_names[idx]
                waterfall_features.append({
                    "feature": _get_display_name(fname),
                    "value": round(float(primary_sv[idx]), 6),
                })

            # Sum of remaining features not in top-K
            remaining_indices = set(range(len(self.feature_names))) - set(top_indices.tolist())
            remaining_sum = sum(float(primary_sv[i]) for i in remaining_indices)
            if abs(remaining_sum) > 1e-6:
                waterfall_features.append({
                    "feature": f"{len(remaining_indices)} other features",
                    "value": round(remaining_sum, 6),
                })

            output_value = primary_base + float(np.sum(primary_sv))

            waterfall = {
                "base_value": round(primary_base, 6),
                "output_value": round(output_value, 6),
                "features": waterfall_features,
            }

            # ── Prediction drivers (human-readable) ──────────────────────
            drivers = self._build_prediction_drivers(
                top_features, is_attack, category, model_type
            )

            # ── Category-level attribution ───────────────────────────────
            category_attribution = self._build_category_attribution(
                primary_sv, self.feature_names
            )

            # ── Assemble result ──────────────────────────────────────────
            result = {
                "top_features": top_features,
                "feature_contributions": feature_contributions,
                "binary_base_value": round(binary_base, 6),
                "multi_base_values": {
                    cn: round(multi_bases[i], 6)
                    for i, cn in enumerate(class_names)
                    if i < len(multi_bases)
                },
                "waterfall": waterfall,
                "prediction_drivers": drivers,
                "category_attribution": category_attribution,
                "model_type": model_type,
                "explainer_type": "SHAP TreeExplainer",
                "top_k": self.top_k,
            }

            logger.debug(
                "[XAI] Explanation generated: %s, top feature=%s (SHAP=%.4f)",
                category,
                top_features[0]["feature"] if top_features else "N/A",
                top_features[0]["shap_value"] if top_features else 0,
            )

            return result

        except Exception as e:
            logger.error("[XAI] Explanation failed: %s", e, exc_info=True)
            return {
                "top_features": [],
                "feature_contributions": {},
                "waterfall": {"base_value": 0, "output_value": 0, "features": []},
                "prediction_drivers": f"XAI explanation unavailable: {e}",
                "category_attribution": {},
                "model_type": "unknown",
                "explainer_type": "SHAP TreeExplainer",
                "top_k": self.top_k,
                "error": str(e),
            }

    def explain_batch(
        self,
        X: np.ndarray,
        predictions: List[Dict[str, Any]],
        class_names: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Generate SHAP explanations for a batch of predictions.

        Args:
            X: Preprocessed feature matrix (n_samples, n_features).
            predictions: List of classification result dicts.
            class_names: List of class names.

        Returns:
            List of XAI result dicts (one per prediction).
        """
        self._ensure_initialized()

        results = []
        try:
            # Compute SHAP values for entire batch at once (efficient)
            binary_shap = self._binary_explainer.shap_values(X)
            binary_ev = self._binary_explainer.expected_value
            multi_shap = self._multi_explainer.shap_values(X)
            multi_ev = self._multi_explainer.expected_value

            for i, pred in enumerate(predictions):
                is_attack = pred.get("is_attack", False)
                category = pred.get("category", "Normal")

                # Extract per-sample SHAP values (handle SHAP >=0.50 ndarray + old list format)
                if isinstance(binary_shap, list):
                    b_sv = binary_shap[1][i]
                    b_base = float(np.asarray(binary_ev).flatten()[1])
                elif binary_shap.ndim == 3:
                    b_sv = binary_shap[i, :, 1]
                    b_base = float(np.asarray(binary_ev).flatten()[1])
                else:
                    b_sv = binary_shap[i]
                    b_base = float(np.asarray(binary_ev).flatten()[0])

                pred_idx = class_names.index(category) if category in class_names else 0
                if isinstance(multi_shap, list):
                    m_sv = multi_shap[pred_idx][i]
                    m_bases = [float(v) for v in np.asarray(multi_ev).flatten()]
                elif multi_shap.ndim == 3:
                    m_sv = multi_shap[i, :, pred_idx]
                    m_bases = [float(v) for v in np.asarray(multi_ev).flatten()]
                else:
                    m_sv = multi_shap[i]
                    m_bases = [float(np.asarray(multi_ev).flatten()[0])]

                # Primary SHAP
                if is_attack:
                    primary_sv = m_sv
                    primary_base = float(m_bases[pred_idx]) if pred_idx < len(m_bases) else m_bases[0]
                    model_type = "multiclass"
                else:
                    primary_sv = b_sv
                    primary_base = b_base
                    model_type = "binary"

                # Top features
                abs_sv = np.abs(primary_sv)
                top_indices = np.argsort(abs_sv)[::-1][:self.top_k]

                top_features = []
                for idx in top_indices:
                    fname = self.feature_names[idx]
                    sv = float(primary_sv[idx])
                    fval = float(X[i][idx])
                    top_features.append({
                        "feature": fname,
                        "display_name": _get_display_name(fname),
                        "shap_value": round(sv, 6),
                        "abs_shap_value": round(abs(sv), 6),
                        "feature_value": round(fval, 4),
                        "impact": "positive" if sv > 0 else "negative",
                        "category": _get_feature_category(fname),
                    })

                drivers = self._build_prediction_drivers(
                    top_features, is_attack, category, model_type
                )

                results.append({
                    "top_features": top_features,
                    "prediction_drivers": drivers,
                    "model_type": model_type,
                    "explainer_type": "SHAP TreeExplainer",
                    "top_k": self.top_k,
                })

        except Exception as e:
            logger.error("[XAI] Batch explanation failed: %s", e)
            results = [{"top_features": [], "error": str(e)} for _ in predictions]

        return results

    def get_global_importance(self) -> List[Dict[str, Any]]:
        """
        Get global feature importance across all predictions.

        Note: This requires a background dataset. For efficiency,
        we use the model's built-in feature_importances_ attribute
        (Gini importance for tree models) as a proxy.

        Returns:
            List of {feature, display_name, importance, category} sorted
            by importance descending.
        """
        try:
            # Use multiclass model's built-in feature importance
            importances = self._multi_model.feature_importances_
            result = []
            for i, fname in enumerate(self.feature_names):
                if importances[i] > 1e-6:  # Skip zero-importance features
                    result.append({
                        "feature": fname,
                        "display_name": _get_display_name(fname),
                        "importance": round(float(importances[i]), 6),
                        "category": _get_feature_category(fname),
                    })
            result.sort(key=lambda x: x["importance"], reverse=True)
            return result
        except Exception as e:
            logger.error("[XAI] Global importance failed: %s", e)
            return []

    def _build_prediction_drivers(
        self,
        top_features: List[Dict[str, Any]],
        is_attack: bool,
        category: str,
        model_type: str,
    ) -> str:
        """Build a human-readable summary of what drove the prediction."""
        if not top_features:
            return "No feature attribution data available."

        # Separate positive (pushing toward prediction) and negative (against)
        pushing = [f for f in top_features if f["impact"] == "positive"]
        opposing = [f for f in top_features if f["impact"] == "negative"]

        parts = []

        if is_attack:
            parts.append(
                f"The model classified this event as {category} based on "
                f"SHAP analysis of {len(self.feature_names)} features."
            )
        else:
            parts.append(
                "The model classified this event as benign based on "
                f"SHAP analysis of {len(self.feature_names)} features."
            )

        if pushing:
            top3 = pushing[:3]
            driver_strs = []
            for f in top3:
                val_str = ""
                if f.get("raw_value") is not None:
                    val_str = f" (value: {f['raw_value']})"
                elif f.get("feature_value") is not None:
                    val_str = f" (value: {f['feature_value']})"
                driver_strs.append(f"{f['display_name']}{val_str}")
            parts.append(
                f"Key drivers: {'; '.join(driver_strs)}."
            )

        if opposing:
            opp_names = [f["display_name"] for f in opposing[:2]]
            parts.append(
                f"Features opposing this classification: {'; '.join(opp_names)}."
            )

        return " ".join(parts)

    def _build_category_attribution(
        self,
        shap_values: np.ndarray,
        feature_names: List[str],
    ) -> Dict[str, float]:
        """
        Aggregate SHAP values by feature category.

        Returns dict mapping category label -> sum of absolute SHAP values.
        """
        category_sums: Dict[str, float] = {}
        for i, fname in enumerate(feature_names):
            cat = _get_feature_category(fname)
            cat_label = CATEGORY_LABELS.get(cat, cat.title())
            if cat_label not in category_sums:
                category_sums[cat_label] = 0.0
            category_sums[cat_label] += abs(float(shap_values[i]))

        # Round and sort
        result = {k: round(v, 6) for k, v in sorted(
            category_sums.items(), key=lambda x: -x[1]
        )}
        return result
