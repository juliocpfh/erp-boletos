// Dados FICTÍCIOS do C6 para o modo de teste do site (`?teste`), copiados de ponte-c6/simulado/*.json (CPF de teste 529.982.247-25,
// CNPJ 11.222.333/0001-81). Mesmo formato EXATO das respostas do C6 (saldo-extrato.yaml, bolepix.yaml, agendamento-de-pagamentos.yaml).
// banco-fase2.js usa estes dados em vez de falar com a ponte quando a página está em `?teste` (a ponte simulada do site).
// Para mudar os dados, altere os JSONs da ponte e copie de novo para cá (sem o campo _comentario).

/** GET /v1/statement/ → { entries[] } por conta (novembro/2026; o mês é trocado pelo pedido). */
export const EXTRATO = {
  "ank": {
    "entries": [
      {
        "local_reference": "01JGHAMYWRSAW41GAMFKEG17VA",
        "created_at": "2026-11-03T09:12:41",
        "entry_date": "2026-11-03",
        "amount": "1219.50",
        "title": "Pix Recebido C6 QR Code",
        "description": "Pix QR Code do boleto 0000003048 - MARIA EXEMPLO",
        "reference": "019aeec0-a61a-8043-4a46-2f191aebdf9a",
        "operation_type": "INCOMING",
        "transaction_type": "CREDIT_QRCODE_PIX_PAYMENT_RECEIVED",
        "end_to_end_id": "E33600000202611030912ANKEXEMPLO01"
      },
      {
        "local_reference": "01JGHAN2K3P7Q9R1S5T7V9W1X3",
        "created_at": "2026-11-05T10:03:15",
        "entry_date": "2026-11-05",
        "amount": "123.45",
        "title": "Pagamento de Boleto",
        "description": "PAGAMENTO BOLETO SANEPAR MATR 123456",
        "reference": "019aeec1-0b2c-7d3e-8f40-1a2b3c4d5e6f",
        "operation_type": "OUTGOING",
        "transaction_type": "PAYMENT"
      },
      {
        "local_reference": "01JGHAN8M4N6P8Q0R2S4T6V8W0",
        "created_at": "2026-11-05T10:04:02",
        "entry_date": "2026-11-05",
        "amount": "210.80",
        "title": "Pagamento de Boleto",
        "description": "PAGAMENTO BOLETO COPEL UC 7654321",
        "reference": "019aeec1-1c3d-7e4f-9051-2b3c4d5e6f70",
        "operation_type": "OUTGOING",
        "transaction_type": "PAYMENT"
      },
      {
        "local_reference": "01JGHANF5P7Q9R1S3T5V7W9X1Y",
        "created_at": "2026-11-06T06:00:00",
        "entry_date": "2026-11-06",
        "amount": "29.90",
        "title": "Tarifa",
        "description": "TARIFA PACOTE DE SERVICOS PJ",
        "reference": "019aeec2-2d4e-7f50-a162-3c4d5e6f7081",
        "operation_type": "OUTGOING",
        "transaction_type": "OTHER"
      },
      {
        "local_reference": "01JGHANM6Q8R0S2T4V6W8X0Y2Z",
        "created_at": "2026-11-10T14:30:00",
        "entry_date": "2026-11-10",
        "amount": "1500.00",
        "title": "Pix Recebido",
        "description": "PIX RECEBIDO JOAO EXEMPLO CPF 529.982.247-25",
        "reference": "019aeec3-3e5f-7061-b273-4d5e6f708192",
        "operation_type": "INCOMING",
        "transaction_type": "CREDIT_PIX_PAYMENT_RECEIVED",
        "end_to_end_id": "E33600000202611101430ANKEXEMPLO02"
      },
      {
        "local_reference": "01JGHANT7R9S1T3V5W7X9Y1Z3A",
        "created_at": "2026-11-10T16:45:10",
        "entry_date": "2026-11-10",
        "amount": "2000.00",
        "title": "TED Enviada",
        "description": "TED PARA JCK ADMINISTRADORA LTDA CNPJ 11.222.333/0001-81",
        "reference": "019aeec3-4f60-7172-c384-5e6f708192a3",
        "operation_type": "OUTGOING",
        "transaction_type": "TRANSFER"
      },
      {
        "local_reference": "01JGHAP08S0T2V4W6X8Y0Z2A4B",
        "created_at": "2026-11-12T11:20:33",
        "entry_date": "2026-11-12",
        "amount": "310.00",
        "title": "Pagamento de Boleto",
        "description": "IPTU PREFEITURA CURITIBA PARCELA 3/10",
        "reference": "019aeec4-5071-7283-d495-6f708192a3b4",
        "operation_type": "OUTGOING",
        "transaction_type": "PAYMENT"
      },
      {
        "local_reference": "01JGHAP69T1V3W5X7Y9Z1A3B5C",
        "created_at": "2026-11-16T08:05:00",
        "entry_date": "2026-11-16",
        "amount": "1800.00",
        "title": "Boleto Liquidado",
        "description": "LIQUIDACAO BOLETO 0000003049 - PEDRO EXEMPLO",
        "reference": "019aeec5-6182-7394-e5a6-708192a3b4c5",
        "operation_type": "INCOMING",
        "transaction_type": "PAYMENT"
      }
    ]
  },
  "jck": {
    "entries": [
      {
        "local_reference": "01JGHB00AV2W4X6Y8Z0A2B4C6D",
        "created_at": "2026-11-06T06:00:00",
        "entry_date": "2026-11-06",
        "amount": "29.90",
        "title": "Tarifa",
        "description": "TARIFA PACOTE DE SERVICOS PJ",
        "reference": "019aeec6-7293-74a5-f6b7-8192a3b4c5d6",
        "operation_type": "OUTGOING",
        "transaction_type": "OTHER"
      },
      {
        "local_reference": "01JGHB06BW3X5Y7Z9A1B3C5D7E",
        "created_at": "2026-11-10T16:45:12",
        "entry_date": "2026-11-10",
        "amount": "2000.00",
        "title": "TED Recebida",
        "description": "TED DE ANK ADMINISTRADORA LTDA CNPJ 11.222.333/0001-81",
        "reference": "019aeec7-83a4-75b6-07c8-92a3b4c5d6e7",
        "operation_type": "INCOMING",
        "transaction_type": "TRANSFER"
      },
      {
        "local_reference": "01JGHB0CCX4Y6Z8A0B2C4D6E8F",
        "created_at": "2026-11-11T09:30:00",
        "entry_date": "2026-11-11",
        "amount": "450.00",
        "title": "Pix Enviado",
        "description": "PIX CONDOMINIO EDIFICIO EXEMPLO",
        "reference": "019aeec8-94b5-76c7-18d9-a3b4c5d6e7f8",
        "operation_type": "OUTGOING",
        "transaction_type": "DEBIT_PIX_PAYMENT_REALIZED",
        "end_to_end_id": "E33600000202611110930JCKEXEMPLO03"
      },
      {
        "local_reference": "01JGHB0JDY5Z7A9B1C3D5E7F9G",
        "created_at": "2026-11-20T07:00:00",
        "entry_date": "2026-11-20",
        "amount": "99.90",
        "title": "Débito Automático",
        "description": "DEBITO AUTOMATICO INTERNET FIBRA EXEMPLO",
        "reference": "019aeec9-a5c6-77d8-29ea-b4c5d6e7f809",
        "operation_type": "OUTGOING",
        "transaction_type": "DIRECT_DEBIT_AGREEMENT"
      }
    ]
  }
};

/** GET /v1/statement/balance → BalanceResponse por conta (reais). */
export const SALDO = {
  "ank": {
    "date": "2026-11-05",
    "currency_code": "BRL",
    "available": 15430.25,
    "locked": 0,
    "future": 1219.5,
    "charges": 0,
    "exceeds_limit": {
      "total": 0,
      "used": 0,
      "available": 0
    },
    "limit": {
      "total": 5000,
      "used": 0,
      "available": 5000
    },
    "total_available": 20430.25,
    "total_available_with_exceed_limit": 20430.25,
    "limit_used_type": "NONE"
  },
  "jck": {
    "date": "2026-11-05",
    "currency_code": "BRL",
    "available": 3870.1,
    "locked": 0,
    "future": 0,
    "charges": 0,
    "exceeds_limit": {
      "total": 0,
      "used": 0,
      "available": 0
    },
    "limit": {
      "total": 0,
      "used": 0,
      "available": 0
    },
    "total_available": 3870.1,
    "total_available_with_exceed_limit": 3870.1,
    "limit_used_type": "NONE"
  }
};

/** GET /v2/bank_slips → { content[] } por conta (só a ANK emite boletos). */
export const BOLETOS_PAGOS = {
  "ank": {
    "content": [
      {
        "id": "01HVSBSTN8CCTCTEQT6MC7TD4B",
        "external_reference_id": "ANK0000000000000000000001A",
        "amount": 1219.5,
        "due_date": "2026-11-10",
        "emission_date": "2026-10-25",
        "description": "Aluguel 11/2026 - Loja 1",
        "days_after_due_date": 30,
        "status": "PAID",
        "origin": "ERP",
        "payment_method": {
          "bank_slip": {
            "originator_id": "000000304872",
            "billing_scheme": "21",
            "billing_type": "3",
            "digitable_line": "33690.00009   03048.720001   92241.282133   5   96900000121950",
            "bar_code": "33695969000000121950000003048720009224128213",
            "our_number": "0000003048",
            "number": "1"
          },
          "pix": {
            "qr_code": "00020126580014BR.GOV.BCB.PIX0114123e4567-e89b-12d3-a456-4266141740005204000053039865404121.955802BR5909ANK ADMIN6008CURITIBA61088000000062070503***6304B14F",
            "image_content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "mime_type": "image/png",
            "reference": "123e4567-e89b-12d3-a456-426614174000"
          }
        },
        "payer": {
          "name": "Maria Exemplo",
          "tax_id": "52998224725",
          "email": "maria.exemplo@exemplo.com.br",
          "address": {
            "address": "Rua das Flores, 100",
            "neighborhood": "Centro",
            "city": "Curitiba",
            "state": "PR",
            "zip_code": "80010000"
          }
        },
        "fees": {
          "fine_type": "PERCENTAGE",
          "fine_value": 2,
          "fine_deadline": 1,
          "interest_type": "MONTHLY_PERCENTAGE",
          "interest_value": 1,
          "interest_deadline": 1
        },
        "payments": [
          {
            "amount": "1219.50",
            "external_payment_id": "01KVG41MYPFJRCJE4AVK9NCFQ1",
            "payment_date": "2026-11-03",
            "credit_date": "2026-11-03",
            "payment_type": "PIX"
          }
        ]
      },
      {
        "id": "01HVSBSTN8CCTCTEQT6MC7TD4C",
        "external_reference_id": "ANK0000000000000000000002B",
        "amount": 1800,
        "due_date": "2026-11-10",
        "emission_date": "2026-10-25",
        "description": "Aluguel 11/2026 - Sala 2",
        "days_after_due_date": 30,
        "status": "PAID",
        "origin": "ERP",
        "payment_method": {
          "bank_slip": {
            "originator_id": "000000304872",
            "billing_scheme": "21",
            "billing_type": "3",
            "digitable_line": "33690.00009   03048.720001   92241.282133   6   96900000180000",
            "bar_code": "33696969000000180000000003048720009224128213",
            "our_number": "0000003049",
            "number": "2"
          },
          "pix": {
            "qr_code": "00020126580014BR.GOV.BCB.PIX0114123e4567-e89b-12d3-a456-4266141740005204000053039865404180.005802BR5909ANK ADMIN6008CURITIBA61088000000062070503***6304C25A",
            "image_content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "mime_type": "image/png",
            "reference": "223e4567-e89b-12d3-a456-426614174001"
          }
        },
        "payer": {
          "name": "Pedro Exemplo",
          "tax_id": "52998224725",
          "address": {
            "address": "Av. Brasil, 200",
            "neighborhood": "Batel",
            "city": "Curitiba",
            "state": "PR",
            "zip_code": "80420000"
          }
        },
        "payments": [
          {
            "amount": "1800.00",
            "external_payment_id": "01KVG41MYPFJRCJE4AVK9NCFQ2",
            "payment_date": "2026-11-13",
            "credit_date": "2026-11-16",
            "payment_type": "BANK_SLIP"
          }
        ]
      },
      {
        "id": "01HVSBSTN8CCTCTEQT6MC7TD4D",
        "external_reference_id": "ANK0000000000000000000003C",
        "amount": 950,
        "due_date": "2026-11-10",
        "emission_date": "2026-10-25",
        "description": "Aluguel 11/2026 - Kitnet 3",
        "days_after_due_date": 30,
        "status": "WAITING_CONFIRMATION",
        "origin": "ERP",
        "payment_method": {
          "bank_slip": {
            "originator_id": "000000304872",
            "billing_scheme": "21",
            "billing_type": "3",
            "digitable_line": "33690.00009   03048.720001   92241.282133   7   96900000095000",
            "bar_code": "33697969000000095000000003048720009224128213",
            "our_number": "0000003050",
            "number": "3"
          },
          "pix": {
            "qr_code": "00020126580014BR.GOV.BCB.PIX0114123e4567-e89b-12d3-a456-4266141740005204000053039865404950.005802BR5909ANK ADMIN6008CURITIBA61088000000062070503***6304D36B",
            "image_content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "mime_type": "image/png",
            "reference": "323e4567-e89b-12d3-a456-426614174002"
          }
        },
        "payer": {
          "name": "Empresa Exemplo Ltda",
          "tax_id": "11222333000181",
          "address": {
            "address": "Rua XV de Novembro, 300",
            "neighborhood": "Centro",
            "city": "Curitiba",
            "state": "PR",
            "zip_code": "80020000"
          }
        },
        "payments": [
          {
            "amount": "950.00",
            "external_payment_id": "01KVG41MYPFJRCJE4AVK9NCFQ3",
            "payment_date": "2026-11-18",
            "payment_type": "BANK_SLIP"
          }
        ]
      }
    ],
    "total_elements": 3,
    "total_pages": 1,
    "page": 0,
    "size": 20
  },
  "jck": {
    "content": [],
    "total_elements": 0,
    "total_pages": 0,
    "page": 0,
    "size": 20
  }
};

/** GET /v1/schedule_payments/query (DDA) → { items[] } por conta. */
export const DDA = {
  "ank": {
    "items": [
      {
        "amount": 123.45,
        "bank_code": "341",
        "bank_name": "Itaú Unibanco",
        "beneficiary_name": "Companhia de Saneamento do Paraná - SANEPAR",
        "content": "34191123450000012345000003048720009224128213",
        "due_date": "2026-11-15",
        "overdue": false,
        "payer_name": "ANK Administradora Ltda"
      },
      {
        "amount": 210.8,
        "bank_code": "001",
        "bank_name": "Banco do Brasil",
        "beneficiary_name": "Copel Distribuição S.A.",
        "content": "00191123450000021080000003048720009224128213",
        "due_date": "2026-11-12",
        "overdue": false,
        "payer_name": "ANK Administradora Ltda"
      }
    ]
  },
  "jck": {
    "items": [
      {
        "amount": 450,
        "bank_code": "336",
        "bank_name": "Banco C6",
        "beneficiary_name": "Condomínio Edifício Exemplo",
        "content": "33691123450000045000000003048720009765974213",
        "due_date": "2026-11-10",
        "overdue": true,
        "payer_name": "JCK Administradora Ltda"
      }
    ]
  }
};

/** GET /v1/schedule_payments/{group_id}/items → um grupo já lido pelo banco. */
export const GRUPO_ITENS = {
  "group_id": "01J3NCKY6Q99QC4D7T733D35QD",
  "items": [
    {
      "id": "01J3NCKY6Q99QC4D7T733D35QE",
      "group_id": "01J3NCKY6Q99QC4D7T733D35QD",
      "content": "34191123450000012345000003048720009224128213",
      "amount": 123.45,
      "description": "Agua Loja 1 11/2026",
      "bank_code": "341",
      "bank_name": "Itaú Unibanco",
      "beneficiary_name": "Companhia de Saneamento do Paraná - SANEPAR",
      "payer_name": "ANK Administradora Ltda",
      "due_date": "2026-11-15",
      "overdue": false,
      "product_type": "BOLETO",
      "status": "READ_DATA",
      "transaction_date": "2026-11-12"
    },
    {
      "id": "01J3NCKY6Q99QC4D7T733D35QF",
      "group_id": "01J3NCKY6Q99QC4D7T733D35QD",
      "content": "11222333000181",
      "amount": 450,
      "description": "Condominio Sala 2 11/2026",
      "bank_code": "336",
      "bank_name": "Banco C6",
      "beneficiary_name": "Condomínio Edifício Exemplo",
      "payer_name": "ANK Administradora Ltda",
      "product_type": "PIX",
      "status": "READ_DATA",
      "transaction_date": "2026-11-12"
    },
    {
      "id": "01J3NCKY6Q99QC4D7T733D35QG",
      "group_id": "01J3NCKY6Q99QC4D7T733D35QD",
      "content": "erro@exemplo.com.br",
      "amount": 10,
      "description": "Teste de chave inexistente",
      "product_type": "PIX",
      "status": "DECODE_ERROR",
      "error_message": "It was not possible to find key: erro@exemplo.com.br",
      "transaction_date": "2026-11-12"
    }
  ]
};
