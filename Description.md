This design document outlines a comprehensive framework for adapting routing, reference data, and multibank data management systems in response to the recent changes introduced by the Cross-Border Payments and Reporting Plus (CBPR+) guidelines under the ISO 20022 standard. The document focuses on:

Routing Logic Evolution: Updating message routing mechanisms to accommodate the enriched and structured data formats introduced by CBPR+. This includes modifications to dynamic message routing based on party identifiers, BICs, and LEIs, while ensuring compliance with the latest SWIFT interoperability and validation requirements.

Reference Data Enhancement: Redefining how financial institutions manage and validate reference data (such as party information, account identifiers, and currency details) to support the increased granularity and structured elements mandated by CBPR+. Emphasis is placed on data lineage, standardization, and external reference sources integration (e.g., SWIFT Ref, GLEIF).

Multibank Data Management: Addressing the complexities of managing data across multiple banking relationships. This includes designing systems to consolidate, normalize, and reconcile message flows across institutions while ensuring consistent application of CBPR+ message schemas (e.g., pacs, camt, and pain series) and tracking of status updates.

The design considers transitional co-existence strategies (MT/ISO 20022), system interoperability, and the impact on operational workflows, offering architectural recommendations, system interface updates, and data governance models to ensure seamless adoption and compliance with the phased CBPR+ rollout schedule.

1. Introduction

This document provides a comprehensive design framework to support routing, reference, and multibank data management aligned with the recent updates introduced by the CBPR+ (Cross-Border Payments and Reporting Plus) initiative under the ISO 20022 messaging standard. These changes aim to modernize and harmonize cross-border payment messaging, necessitating significant updates in data handling and infrastructure.

2. Objectives

Align routing logic with structured CBPR+ message components.

Enhance reference data models to support ISO 20022 semantic elements.

Implement robust multibank data integration and reconciliation mechanisms.

Ensure forward and backward compatibility during the coexistence period with MT messages.

3. Background

CBPR+ is a SWIFT-led initiative to implement ISO 20022 for cross-border and correspondent banking payments. The transition introduces rich, structured, and granular message formats replacing traditional MT message types. Key message categories impacted include:

pacs.008 / pacs.009 – Customer and financial institution credit transfers.

camt.056 / camt.029 – Payment returns and status investigations.

camt.052 / camt.053 / camt.054 – Statement and reporting messages.

These changes require overhauling data structures, routing algorithms, and multi-institution messaging coordination.

4. Routing Logic Redesign

4.1 Current Limitations

Reliance on fixed field positions and free-text parsing.

Limited dynamic routing based on unstructured BICs and account data.

4.2 Design Enhancements

Structured Party Identification: Implement routing decisions using structured fields like <Cdtr>, <Dbtr>, <FinInstnId>, and <LEI>.

Dynamic Routing Rules Engine: Introduce a rules engine capable of evaluating message content, validating against reference data, and determining routing paths.

Integration with SWIFT RMA and Transaction Screening: Incorporate RMA authorization checks and compliance filters into the routing pipeline.

5. Reference Data Management

5.1 Data Model Expansion

Extend internal reference data schemas to store structured ISO 20022 elements such as:

Legal Entity Identifiers (LEIs)

Structured addresses

Purpose codes and remittance information

5.2 Data Validation and Governance

Implement data quality checks for incoming messages (e.g., SWIFTRef cross-validation).

Introduce versioning and audit trails for reference data updates.

5.3 External Data Integration

Connect to authoritative sources like SWIFTRef, GLEIF, and central bank registries to enrich and validate reference data.

6. Multibank Data Management

6.1 Data Consolidation

Develop aggregation logic to merge inbound and outbound message flows across multiple banking partners.

Normalize message formats into a unified internal schema.

6.2 Message Lifecycle Tracking

Track message statuses using ISO 20022 status reports (camt.029, pain.002) and map them to business workflows.

Establish correlation mechanisms between original and response messages (using MsgId, EndToEndId).

6.3 Reconciliation and Exception Handling

Automate reconciliation of expected vs actual transaction flows across multiple institutions.

Implement exception dashboards for failed or delayed message investigation.

7. Coexistence Strategy

7.1 Dual Message Support

Maintain MT and ISO 20022 message support during the transition period.

Translate between MT and ISO formats using transformation engines.

7.2 Transition Planning

Phased rollout of ISO 20022 support per corridor and counterparty readiness.

Close monitoring of SWIFT release schedules and compliance timelines.

8. Security and Compliance

Ensure message data confidentiality and integrity in compliance with SWIFT CSP and local regulatory frameworks.

Audit logging of message routing decisions and data transformations.

9. Architecture Overview

9.1 Component Diagram

Routing Engine

Reference Data Repository

Multibank Integration Layer

Message Transformation Service

Monitoring and Exception Management UI

9.2 Integration Points

SWIFT Network Interfaces (Alliance Access/Cloud)

Internal Core Banking Systems

External Data Providers (SWIFTRef, GLEIF)

10. Conclusion and Next Steps

This document lays the groundwork for a strategic transformation to support CBPR+ and ISO 20022. Immediate next steps include:

Finalizing the target data model.

Prototyping routing rules based on structured identifiers.

Establishing a reference data governance committee.

Initiating pilot testing with select multibank partners.
