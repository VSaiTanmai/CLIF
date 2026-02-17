"""
CLIF Tier-2 ML Inference Module
================================
Loads trained models and classifies incoming security events.
Populates ai_confidence and ai_explanation fields for ClickHouse.

Usage:
    from inference import CLIFClassifier
    clf = CLIFClassifier()
    result = clf.classify(event_dict)
    # result = {'is_attack': True, 'confidence': 0.97, 'category': 'DoS',
    #           'clif_category': 'denial_of_service', 'explanation': '...'}
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from typing import Dict, Any, Optional, List


class CLIFClassifier:
    """
    CLIF Tier-2 ML Classifier for real-time event classification.
    Uses trained XGBoost/LightGBM/RF models on NSL-KDD features.
    """

    def __init__(self, model_dir: Optional[str] = None):
        if model_dir is None:
            model_dir = str(Path(__file__).resolve().parent.parent / "models")
        self.model_dir = Path(model_dir)
        self._load_models()

    def _load_models(self):
        """Load all model artifacts."""
        # Load config
        config_path = self.model_dir / "model_config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Model config not found: {config_path}")

        with open(config_path) as f:
            self.config = json.load(f)

        # Load models
        self.binary_model = joblib.load(self.model_dir / self.config['binary_model']['file'])
        self.multi_model = joblib.load(self.model_dir / self.config['multiclass_model']['file'])
        self.scaler = joblib.load(self.model_dir / "scaler.joblib")
        self.label_encoder = joblib.load(self.model_dir / "label_encoder.joblib")

        # Feature configuration
        self.feature_cols = self.config['feature_cols']
        self.categorical_cols = self.config['categorical_cols']
        self.numerical_cols = self.config['numerical_cols']
        self.encoded_features = self.config['encoded_feature_names']
        self.clif_category_map = self.config['multiclass_model']['clif_category_map']

        # Pre-compute category names
        self.class_names = list(self.label_encoder.classes_)

        print(f"[CLIF-ML] Models loaded from {self.model_dir}")
        print(f"  Binary:     {self.config['binary_model']['name']} "
              f"(acc={self.config['binary_model']['accuracy']:.4f})")
        print(f"  Multiclass: {self.config['multiclass_model']['name']} "
              f"(acc={self.config['multiclass_model']['accuracy']:.4f})")
        print(f"  Features:   {len(self.encoded_features)} total")

    def _preprocess_event(self, event: Dict[str, Any]) -> np.ndarray:
        """
        Convert a raw event dict to the feature vector expected by the model.

        The event dict should contain keys matching NSL-KDD feature names.
        For CLIF pipeline events, a mapping layer converts CLIF fields to
        NSL-KDD features.
        """
        # Create a single-row DataFrame
        row = {}
        for col in self.feature_cols:
            if col in event:
                row[col] = event[col]
            elif col in self.numerical_cols:
                row[col] = 0  # Default numerical
            else:
                row[col] = 'other'  # Default categorical

        df = pd.DataFrame([row])

        # One-hot encode categorical features
        df_encoded = pd.get_dummies(df, columns=self.categorical_cols, drop_first=False)

        # Ensure all encoded columns exist (fill missing with 0)
        for col in self.encoded_features:
            if col not in df_encoded.columns:
                df_encoded[col] = 0

        # Reorder columns to match training
        df_encoded = df_encoded[self.encoded_features]

        # Scale numerical features
        df_encoded[self.numerical_cols] = self.scaler.transform(df_encoded[self.numerical_cols])

        return df_encoded.values.astype(np.float32)

    def _preprocess_batch(self, events: List[Dict[str, Any]]) -> np.ndarray:
        """Preprocess a batch of events efficiently."""
        rows = []
        for event in events:
            row = {}
            for col in self.feature_cols:
                if col in event:
                    row[col] = event[col]
                elif col in self.numerical_cols:
                    row[col] = 0
                else:
                    row[col] = 'other'
            rows.append(row)

        df = pd.DataFrame(rows)

        # One-hot encode
        df_encoded = pd.get_dummies(df, columns=self.categorical_cols, drop_first=False)

        # Ensure all columns exist
        for col in self.encoded_features:
            if col not in df_encoded.columns:
                df_encoded[col] = 0

        df_encoded = df_encoded[self.encoded_features]

        # Scale
        df_encoded[self.numerical_cols] = self.scaler.transform(df_encoded[self.numerical_cols])

        return df_encoded.values.astype(np.float32)

    def classify(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classify a single security event.

        Args:
            event: Dict with NSL-KDD feature names as keys.

        Returns:
            Dict with classification results:
                - is_attack: bool
                - confidence: float (0-1)
                - category: str (DoS/Normal/Probe/R2L/U2R)
                - clif_category: str (CLIF event category)
                - explanation: str (human-readable explanation)
                - severity: str (critical/high/medium/low/info)
        """
        X = self._preprocess_event(event)

        # Binary prediction with probability
        binary_prob = self.binary_model.predict_proba(X)[0]
        is_attack = bool(binary_prob[1] > 0.5)
        confidence = float(max(binary_prob))

        # Multi-class prediction
        multi_prob = self.multi_model.predict_proba(X)[0]
        multi_pred = int(np.argmax(multi_prob))
        category = self.class_names[multi_pred]
        category_confidence = float(multi_prob[multi_pred])

        # Map to CLIF category
        clif_category = self.clif_category_map.get(category, 'unknown')

        # Determine severity
        severity = self._compute_severity(is_attack, category, confidence, category_confidence)

        # Generate explanation
        explanation = self._generate_explanation(
            is_attack, category, confidence, category_confidence, event, severity
        )

        return {
            'is_attack': is_attack,
            'confidence': round(confidence, 4),
            'category': category,
            'category_confidence': round(category_confidence, 4),
            'clif_category': clif_category,
            'severity': severity,
            'explanation': explanation,
            'binary_probs': {'normal': round(float(binary_prob[0]), 4),
                             'attack': round(float(binary_prob[1]), 4)},
            'multi_probs': {self.class_names[i]: round(float(multi_prob[i]), 4)
                            for i in range(len(self.class_names))},
        }

    def classify_batch(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Classify a batch of events efficiently.

        Args:
            events: List of event dicts.

        Returns:
            List of classification result dicts.
        """
        if not events:
            return []

        X = self._preprocess_batch(events)

        # Binary predictions
        binary_probs = self.binary_model.predict_proba(X)

        # Multi-class predictions
        multi_probs = self.multi_model.predict_proba(X)

        results = []
        for i, event in enumerate(events):
            is_attack = bool(binary_probs[i][1] > 0.5)
            confidence = float(max(binary_probs[i]))

            multi_pred = int(np.argmax(multi_probs[i]))
            category = self.class_names[multi_pred]
            category_confidence = float(multi_probs[i][multi_pred])

            clif_category = self.clif_category_map.get(category, 'unknown')
            severity = self._compute_severity(is_attack, category, confidence, category_confidence)
            explanation = self._generate_explanation(
                is_attack, category, confidence, category_confidence, event, severity
            )

            results.append({
                'is_attack': is_attack,
                'confidence': round(confidence, 4),
                'category': category,
                'category_confidence': round(category_confidence, 4),
                'clif_category': clif_category,
                'severity': severity,
                'explanation': explanation,
            })

        return results

    def _compute_severity(self, is_attack: bool, category: str,
                          confidence: float, category_confidence: float) -> str:
        """Compute severity level based on classification results."""
        if not is_attack:
            return 'info'

        # Severity based on attack category and confidence
        severity_map = {
            'U2R': 'critical',      # Privilege escalation
            'R2L': 'high',          # Remote access
            'DoS': 'high',          # Denial of service
            'Probe': 'medium',      # Reconnaissance
        }

        base_severity = severity_map.get(category, 'medium')

        # Upgrade severity for high-confidence attacks
        if confidence > 0.95 and category_confidence > 0.9:
            if base_severity == 'medium':
                base_severity = 'high'
            elif base_severity == 'high':
                base_severity = 'critical'

        # Downgrade for low confidence
        if confidence < 0.7:
            if base_severity == 'critical':
                base_severity = 'high'
            elif base_severity == 'high':
                base_severity = 'medium'
            elif base_severity == 'medium':
                base_severity = 'low'

        return base_severity

    def _generate_explanation(self, is_attack: bool, category: str,
                              confidence: float, cat_confidence: float,
                              event: Dict[str, Any], severity: str) -> str:
        """Generate human-readable explanation of the classification."""
        if not is_attack:
            return (f"Traffic classified as benign with {confidence:.1%} confidence. "
                    f"No anomalous patterns detected.")

        # Build explanation based on category
        category_descriptions = {
            'DoS': 'Denial of Service attack pattern detected',
            'Probe': 'Network reconnaissance/scanning activity detected',
            'R2L': 'Remote-to-Local intrusion attempt detected',
            'U2R': 'User-to-Root privilege escalation attempt detected',
        }

        desc = category_descriptions.get(category, 'Anomalous activity detected')

        # Add feature context
        context_parts = []
        if event.get('src_bytes', 0) > 10000:
            context_parts.append(f"high src_bytes={event['src_bytes']}")
        if event.get('dst_bytes', 0) > 10000:
            context_parts.append(f"high dst_bytes={event['dst_bytes']}")
        if event.get('count', 0) > 100:
            context_parts.append(f"high connection count={event['count']}")
        if event.get('serror_rate', 0) > 0.5:
            context_parts.append(f"high SYN error rate={event['serror_rate']:.1%}")
        if event.get('same_srv_rate', 0) < 0.1:
            context_parts.append("diverse service targeting")
        if event.get('num_failed_logins', 0) > 0:
            context_parts.append(f"failed logins={event['num_failed_logins']}")
        if event.get('root_shell', 0) > 0:
            context_parts.append("root shell obtained")
        if event.get('num_compromised', 0) > 0:
            context_parts.append(f"compromised conditions={event['num_compromised']}")

        protocol = event.get('protocol_type', 'unknown')
        service = event.get('service', 'unknown')

        explanation = (
            f"[{severity.upper()}] {desc}. "
            f"Category: {category} ({cat_confidence:.1%} confidence). "
            f"Protocol: {protocol}, Service: {service}. "
        )

        if context_parts:
            explanation += "Key indicators: " + "; ".join(context_parts) + ". "

        explanation += f"Overall attack confidence: {confidence:.1%}."

        return explanation

    def get_model_info(self) -> Dict[str, Any]:
        """Return model metadata for monitoring/dashboard."""
        return {
            'version': self.config.get('version', 'unknown'),
            'dataset': self.config.get('dataset', 'unknown'),
            'created': self.config.get('created', 'unknown'),
            'binary_model': {
                'name': self.config['binary_model']['name'],
                'accuracy': self.config['binary_model']['accuracy'],
                'f1': self.config['binary_model']['f1'],
            },
            'multiclass_model': {
                'name': self.config['multiclass_model']['name'],
                'accuracy': self.config['multiclass_model']['accuracy'],
                'f1': self.config['multiclass_model']['f1'],
                'classes': self.class_names,
            },
            'feature_count': len(self.encoded_features),
            'clif_categories': self.clif_category_map,
        }


def map_clif_event_to_features(clif_event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map a CLIF pipeline event (from ClickHouse/Redpanda) to NSL-KDD features.

    CLIF events have fields like: source_ip, dest_ip, source_port, dest_port,
    protocol, event_type, severity, etc.

    This mapper extracts network-level features that align with NSL-KDD schema.
    """
    features = {}

    # Direct mappings
    features['duration'] = clif_event.get('duration', 0)
    features['protocol_type'] = clif_event.get('protocol', 'tcp').lower()
    features['service'] = _map_service(clif_event.get('dest_port', 0),
                                        clif_event.get('service', ''))
    features['flag'] = clif_event.get('connection_flag', 'SF')

    # Byte counts
    features['src_bytes'] = clif_event.get('bytes_sent', clif_event.get('src_bytes', 0))
    features['dst_bytes'] = clif_event.get('bytes_received', clif_event.get('dst_bytes', 0))

    # Connection features
    features['land'] = int(clif_event.get('source_ip', '') == clif_event.get('dest_ip', ''))
    features['wrong_fragment'] = clif_event.get('wrong_fragment', 0)
    features['urgent'] = clif_event.get('urgent', 0)

    # Content features
    features['hot'] = clif_event.get('hot_indicators', 0)
    features['num_failed_logins'] = clif_event.get('failed_logins', 0)
    features['logged_in'] = int(clif_event.get('logged_in', False))
    features['num_compromised'] = clif_event.get('num_compromised', 0)
    features['root_shell'] = int(clif_event.get('root_shell', False))
    features['su_attempted'] = int(clif_event.get('su_attempted', False))
    features['num_root'] = clif_event.get('num_root', 0)
    features['num_file_creations'] = clif_event.get('num_file_creations', 0)
    features['num_shells'] = clif_event.get('num_shells', 0)
    features['num_access_files'] = clif_event.get('num_access_files', 0)
    features['num_outbound_cmds'] = clif_event.get('num_outbound_cmds', 0)
    features['is_host_login'] = int(clif_event.get('is_host_login', False))
    features['is_guest_login'] = int(clif_event.get('is_guest_login', False))

    # Traffic features (aggregated)
    features['count'] = clif_event.get('connection_count', 1)
    features['srv_count'] = clif_event.get('srv_count', 1)
    features['serror_rate'] = clif_event.get('serror_rate', 0.0)
    features['srv_serror_rate'] = clif_event.get('srv_serror_rate', 0.0)
    features['rerror_rate'] = clif_event.get('rerror_rate', 0.0)
    features['srv_rerror_rate'] = clif_event.get('srv_rerror_rate', 0.0)
    features['same_srv_rate'] = clif_event.get('same_srv_rate', 0.0)
    features['diff_srv_rate'] = clif_event.get('diff_srv_rate', 0.0)
    features['srv_diff_host_rate'] = clif_event.get('srv_diff_host_rate', 0.0)

    # Host-based features
    features['dst_host_count'] = clif_event.get('dst_host_count', 0)
    features['dst_host_srv_count'] = clif_event.get('dst_host_srv_count', 0)
    features['dst_host_same_srv_rate'] = clif_event.get('dst_host_same_srv_rate', 0.0)
    features['dst_host_diff_srv_rate'] = clif_event.get('dst_host_diff_srv_rate', 0.0)
    features['dst_host_same_src_port_rate'] = clif_event.get('dst_host_same_src_port_rate', 0.0)
    features['dst_host_srv_diff_host_rate'] = clif_event.get('dst_host_srv_diff_host_rate', 0.0)
    features['dst_host_serror_rate'] = clif_event.get('dst_host_serror_rate', 0.0)
    features['dst_host_srv_serror_rate'] = clif_event.get('dst_host_srv_serror_rate', 0.0)
    features['dst_host_rerror_rate'] = clif_event.get('dst_host_rerror_rate', 0.0)
    features['dst_host_srv_rerror_rate'] = clif_event.get('dst_host_srv_rerror_rate', 0.0)

    return features


def _map_service(port: int, service_name: str) -> str:
    """Map port/service to NSL-KDD service names."""
    if service_name and service_name.lower() not in ('', 'unknown', 'other'):
        return service_name.lower()

    port_map = {
        20: 'ftp_data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp',
        53: 'domain_u', 67: 'other', 68: 'other', 79: 'finger', 80: 'http',
        110: 'pop_3', 111: 'sunrpc', 113: 'auth', 119: 'nntp', 123: 'ntp_u',
        139: 'netbios_ns', 143: 'imap4', 161: 'snmp', 179: 'bgp',
        389: 'ldap', 443: 'http', 445: 'netbios_ssn', 465: 'smtp',
        514: 'syslog', 515: 'printer', 543: 'klogin', 544: 'kshell',
        587: 'smtp', 993: 'imap4', 995: 'pop_3', 1433: 'sql_net',
        1521: 'sql_net', 2049: 'nfs', 3306: 'sql_net', 3389: 'remote_job',
        5432: 'sql_net', 5900: 'remote_job', 6667: 'IRC', 8080: 'http',
        8443: 'http',
    }

    return port_map.get(port, 'other')


# ============================================================
# STANDALONE TESTING
# ============================================================
if __name__ == '__main__':
    import time

    print("CLIF ML Inference Module - Standalone Test")
    print("=" * 50)

    clf = CLIFClassifier()

    # Test with sample events
    test_events = [
        # Normal HTTP traffic
        {
            'duration': 0, 'protocol_type': 'tcp', 'service': 'http', 'flag': 'SF',
            'src_bytes': 215, 'dst_bytes': 45076, 'land': 0, 'wrong_fragment': 0,
            'urgent': 0, 'hot': 0, 'num_failed_logins': 0, 'logged_in': 1,
            'num_compromised': 0, 'root_shell': 0, 'su_attempted': 0, 'num_root': 0,
            'num_file_creations': 0, 'num_shells': 0, 'num_access_files': 0,
            'num_outbound_cmds': 0, 'is_host_login': 0, 'is_guest_login': 0,
            'count': 5, 'srv_count': 5, 'serror_rate': 0.0, 'srv_serror_rate': 0.0,
            'rerror_rate': 0.0, 'srv_rerror_rate': 0.0, 'same_srv_rate': 1.0,
            'diff_srv_rate': 0.0, 'srv_diff_host_rate': 0.0, 'dst_host_count': 255,
            'dst_host_srv_count': 255, 'dst_host_same_srv_rate': 1.0,
            'dst_host_diff_srv_rate': 0.0, 'dst_host_same_src_port_rate': 0.0,
            'dst_host_srv_diff_host_rate': 0.0, 'dst_host_serror_rate': 0.0,
            'dst_host_srv_serror_rate': 0.0, 'dst_host_rerror_rate': 0.0,
            'dst_host_srv_rerror_rate': 0.0,
        },
        # SYN flood (DoS) pattern
        {
            'duration': 0, 'protocol_type': 'tcp', 'service': 'private', 'flag': 'S0',
            'src_bytes': 0, 'dst_bytes': 0, 'land': 0, 'wrong_fragment': 0,
            'urgent': 0, 'hot': 0, 'num_failed_logins': 0, 'logged_in': 0,
            'num_compromised': 0, 'root_shell': 0, 'su_attempted': 0, 'num_root': 0,
            'num_file_creations': 0, 'num_shells': 0, 'num_access_files': 0,
            'num_outbound_cmds': 0, 'is_host_login': 0, 'is_guest_login': 0,
            'count': 511, 'srv_count': 511, 'serror_rate': 1.0, 'srv_serror_rate': 1.0,
            'rerror_rate': 0.0, 'srv_rerror_rate': 0.0, 'same_srv_rate': 1.0,
            'diff_srv_rate': 0.0, 'srv_diff_host_rate': 0.0, 'dst_host_count': 255,
            'dst_host_srv_count': 255, 'dst_host_same_srv_rate': 1.0,
            'dst_host_diff_srv_rate': 0.0, 'dst_host_same_src_port_rate': 1.0,
            'dst_host_srv_diff_host_rate': 0.0, 'dst_host_serror_rate': 1.0,
            'dst_host_srv_serror_rate': 1.0, 'dst_host_rerror_rate': 0.0,
            'dst_host_srv_rerror_rate': 0.0,
        },
        # Port scan (Probe) pattern
        {
            'duration': 0, 'protocol_type': 'tcp', 'service': 'other', 'flag': 'RSTO',
            'src_bytes': 0, 'dst_bytes': 0, 'land': 0, 'wrong_fragment': 0,
            'urgent': 0, 'hot': 0, 'num_failed_logins': 0, 'logged_in': 0,
            'num_compromised': 0, 'root_shell': 0, 'su_attempted': 0, 'num_root': 0,
            'num_file_creations': 0, 'num_shells': 0, 'num_access_files': 0,
            'num_outbound_cmds': 0, 'is_host_login': 0, 'is_guest_login': 0,
            'count': 6, 'srv_count': 1, 'serror_rate': 0.0, 'srv_serror_rate': 0.0,
            'rerror_rate': 0.83, 'srv_rerror_rate': 1.0, 'same_srv_rate': 0.17,
            'diff_srv_rate': 0.06, 'srv_diff_host_rate': 0.0, 'dst_host_count': 255,
            'dst_host_srv_count': 1, 'dst_host_same_srv_rate': 0.0,
            'dst_host_diff_srv_rate': 0.06, 'dst_host_same_src_port_rate': 0.0,
            'dst_host_srv_diff_host_rate': 0.0, 'dst_host_serror_rate': 0.0,
            'dst_host_srv_serror_rate': 0.0, 'dst_host_rerror_rate': 0.88,
            'dst_host_srv_rerror_rate': 1.0,
        },
    ]

    labels = ['Normal HTTP', 'SYN Flood (DoS)', 'Port Scan (Probe)']

    for label, event in zip(labels, test_events):
        print(f"\n--- {label} ---")
        result = clf.classify(event)
        print(f"  Attack: {result['is_attack']}, Confidence: {result['confidence']:.4f}")
        print(f"  Category: {result['category']} ({result['category_confidence']:.4f})")
        print(f"  CLIF Category: {result['clif_category']}")
        print(f"  Severity: {result['severity']}")
        print(f"  Explanation: {result['explanation']}")

    # Batch test
    print(f"\n--- Batch Classification ({len(test_events)} events) ---")
    t0 = time.time()
    batch_results = clf.classify_batch(test_events)
    batch_time = (time.time() - t0) * 1000
    print(f"  Batch time: {batch_time:.2f}ms ({batch_time/len(test_events):.2f}ms/event)")
    for label, result in zip(labels, batch_results):
        print(f"  {label}: attack={result['is_attack']}, "
              f"cat={result['category']}, conf={result['confidence']:.4f}")

    # Throughput test
    print(f"\n--- Throughput Test (1000 events) ---")
    events_1k = test_events * 334  # ~1002 events
    t0 = time.time()
    results_1k = clf.classify_batch(events_1k)
    throughput_time = time.time() - t0
    print(f"  {len(events_1k)} events in {throughput_time:.3f}s")
    print(f"  Throughput: {len(events_1k)/throughput_time:,.0f} events/sec")
    print(f"  Latency: {throughput_time/len(events_1k)*1000:.3f} ms/event")

    # Model info
    print(f"\n--- Model Info ---")
    info = clf.get_model_info()
    print(json.dumps(info, indent=2))
