all: offers data/ec2.json

.PHONY: offers
offers:
	wget --compression=auto -N -r -nH https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json \
		https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json \
		https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/index.json \
		https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonElastiCache/current/index.json

data/ec2.json: preprocess.js
	./preprocess.js
