# Deploy to OpenShift

`openshift/ai-interview-platform-template.yaml` is a parameterized template that creates a `Deployment`, `Service`, `Route`, `ConfigMap` and `Secret`. Run the commands below from the repository root.

## 1) Login and target project

```bash
oc login <openshift-api-url>
oc new-project ai-interview-platform
oc project ai-interview-platform
```

If your cluster/project enforces image pull auth for GHCR, create a pull secret and link it:

```bash
oc create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-token-with-read-packages> \
  --docker-email=<your-email>

oc secrets link default ghcr-pull-secret --for=pull
```

## 2) Process and apply template

Replace placeholders with your values:

```bash
oc process -f openshift/ai-interview-platform-template.yaml \
  -p APP_NAMESPACE=ai-interview-platform \
  -p APP_IMAGE=ghcr.io/agents-adityaupadhyay/ai-interview-portal:latest \
  -p NEXTAUTH_URL=https://<your-route-host> \
  -p NEXT_PUBLIC_APP_URL=https://<your-route-host> \
  -p DATABASE_URL='<your-database-url>' \
  -p NEXTAUTH_SECRET='<your-nextauth-secret>' \
  -p AI_API_KEY='<your-ai-api-key>' \
  -p DEEPGRAM_API_KEY='<your-deepgram-key>' \
  -p SMTP_PASS='<your-smtp-pass>' \
  -p ROUTE_HOST='<your-route-host>' \
  | oc apply -f -
```

Notes:

- Keep `NODE_TLS_REJECT_UNAUTHORIZED=1` for production.
- If you do not want a fixed hostname, omit `ROUTE_HOST`.
- Recordings and proctoring photos go to `/app/data`, which the template mounts as an `emptyDir`: **they are lost when the pod restarts**. Replace it with a `PersistentVolumeClaim` if you need to keep them.

## 3) Verify rollout

```bash
oc get pods
oc rollout status deployment/ai-interview-platform
oc get svc,route
```

## 4) Verify health endpoint

```bash
ROUTE_URL=$(oc get route ai-interview-platform -o jsonpath='{.spec.host}')
curl -f "https://${ROUTE_URL}/api/health"
```

## 5) Update image

To deploy a new image tag:

```bash
oc set image deployment/ai-interview-platform \
  ai-interview-platform=ghcr.io/agents-adityaupadhyay/ai-interview-portal:<new-tag>

oc rollout status deployment/ai-interview-platform
```
